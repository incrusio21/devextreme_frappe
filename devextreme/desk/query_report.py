# Copyright (c) 2024, DAS and Contributors
# License: MIT. See LICENSE

import os

import frappe
from frappe import _

from frappe.modules import get_module_path, scrub
from frappe.model.utils import render_include
from frappe.utils import get_html_format

def get_report_doc(report_name):
	doc = frappe.get_doc("Devextreme Report", report_name)
	doc.custom_columns = []
	doc.custom_filters = []

	if not doc.is_permitted():
		frappe.throw(
			_("You don't have access to Report: {0}").format(report_name),
			frappe.PermissionError,
		)

	if not frappe.has_permission(doc.ref_doctype, "report"):
		frappe.throw(
			_("You don't have permission to get a report on: {0}").format(doc.ref_doctype),
			frappe.PermissionError,
		)

	if doc.disabled:
		frappe.throw(_("Report {0} is disabled").format(report_name))

	return doc

@frappe.whitelist()
def get_script(report_name):
    report = get_report_doc(report_name)
    module = report.module or frappe.db.get_value("DocType", report.ref_doctype, "module")

    is_custom_module = frappe.get_cached_value("Module Def", module, "custom")
	
    # custom modules are virtual modules those exists in DB but not in disk.
    module_path = "" if is_custom_module else get_module_path(module)
    report_folder = module_path and os.path.join(module_path, scrub(report.doctype), scrub(report.name))
    script_path = report_folder and os.path.join(report_folder, scrub(report.name) + ".js")
    print_path = report_folder and os.path.join(report_folder, scrub(report.name) + ".html")

    script = None
    if os.path.exists(script_path):
        with open(script_path) as f:
            script = f.read()
            script += f"\n\n//# sourceURL={scrub(report.name)}.js"
			
    html_format = get_html_format(print_path)

    if not script and report.javascript:
        script = report.javascript
        script += f"\n\n//# sourceURL={scrub(report.name)}__custom"

    if not script:
        script = "frappe.query_reports['%s']={}" % report_name

    return {
        "script": render_include(script),
        "html_format": html_format,
        "execution_time": frappe.cache.hget("report_execution_time", report_name) or 0,
        "filters": report.filters
    }