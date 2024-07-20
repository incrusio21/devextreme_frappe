# Copyright (c) 2024, DAS and Contributors
# License: MIT. See LICENSE

import frappe
from frappe.permissions import has_permission
from frappe.query_builder import DocType
from frappe.query_builder.custom import ConstantColumn
from frappe.query_builder.functions import Count
from frappe.query_builder.terms import SubQuery

def boot_session(bootinfo):
    if frappe.session["user"] != "Guest":
        bootinfo.user.devextreme_report = get_user_pages_or_reports("Devextreme Report", cache=False)
        
        # all_reports
    return bootinfo

# /home/frappe/frappe-bench/apps/frappe/frappe/boot.py
def get_user_pages_or_reports(parent, cache=False):
    if cache:
        has_role = frappe.cache.get_value("has_role:" + parent, user=frappe.session.user)
        if has_role:
            return has_role

    roles = frappe.get_roles()
    has_role = {}

    report = DocType("Devextreme Report")

    columns = (report.name.as_("title"), report.ref_doctype)

    hasRole = DocType("Has Role")
    parentTable = DocType(parent)

    pages_with_standard_roles = (
        frappe.qb.from_(hasRole)
        .from_(parentTable)
        .select(parentTable.name.as_("name"), parentTable.modified, *columns)
        .where(
            (hasRole.role.isin(roles)) & (hasRole.parent == parentTable.name) 
        )
        .distinct()
    )

    pages_with_standard_roles = pages_with_standard_roles.where(report.disabled == 0).run(as_dict=True)

    for p in pages_with_standard_roles:
        if p.name not in has_role:
            has_role[p.name] = {"modified": p.modified, "title": p.title, "ref_doctype": p.ref_doctype}

    no_of_roles = SubQuery(
        frappe.qb.from_(hasRole).select(Count("*")).where(hasRole.parent == parentTable.name)
    )

    # pages and reports with no role are allowed
    rows_with_no_roles = (
        frappe.qb.from_(parentTable)
        .select(parentTable.name, parentTable.modified, *columns)
        .where(no_of_roles == 0)
    ).run(as_dict=True)

    for r in rows_with_no_roles:
        if r.name not in has_role:
            has_role[r.name] = {"modified": r.modified, "title": r.title, "ref_doctype": r.ref_doctype}
            
    if not has_permission("Devextreme Report", raise_exception=False):
        return {}

    reports = frappe.get_list(
        "Devextreme Report",
        fields=["name", "report_type"],
        filters={"name": ("in", has_role.keys())},
        ignore_ifnull=True,
    )
    for report in reports:
        has_role[report.name]["report_type"] = "Report Devextreme"

    non_permitted_reports = set(has_role.keys()) - {r.name for r in reports}
    for r in non_permitted_reports:
        has_role.pop(r, None)

    # Expire every six hours
    frappe.cache.set_value("has_role:" + parent, has_role, frappe.session.user, 21600)

    return has_role