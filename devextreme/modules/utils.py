# Copyright (c) 2024, DAS and Contributors
# License: MIT. See LICENSE

"""
	Utilities for using modules
"""
import os
from textwrap import dedent, indent
from typing import TYPE_CHECKING, Union

import frappe
from frappe import _, get_module_path, scrub
from frappe.modules import get_app_publisher, get_doc_path
from frappe.utils import cstr, now_datetime

if TYPE_CHECKING:
	from frappe.model.document import Document

def make_boilerplate(
	template: str, doc: Union["Document", "frappe._dict"], opts: Union[dict, "frappe._dict"] = None
):
    target_path = get_doc_path(doc.module, doc.doctype, doc.name)
    template_name = template.replace("controller", scrub(doc.name))
    if template_name.endswith("._py"):
        template_name = template_name[:-4] + ".py"
    target_file_path = os.path.join(target_path, template_name)

    module = frappe.db.get_value("DocType", doc.doctype, "module", cache=1)
    template_file_path = os.path.join(
        get_module_path(module), "doctype", scrub(doc.doctype), "boilerplate", template
    )

    if os.path.exists(target_file_path):
        print(f"{target_file_path} already exists, skipping...")
        return

    doc = doc or frappe._dict()
    opts = opts or frappe._dict()
    app_publisher = get_app_publisher(doc.module)
    base_class = "Document"
    base_class_import = "from frappe.model.document import Document"
    controller_body = "pass"

    if doc.get("is_tree"):
        base_class = "NestedSet"
        base_class_import = "from frappe.utils.nestedset import NestedSet"

    if doc.get("is_virtual"):
        controller_body = indent(
            dedent(
                """
            def db_insert(self, *args, **kwargs):
                pass

            def load_from_db(self):
                pass

            def db_update(self):
                pass

            @staticmethod
            def get_list(args):
                pass

            @staticmethod
            def get_count(args):
                pass

            @staticmethod
            def get_stats(args):
                pass
            """
            ),
            "\t",
        )

    with open(target_file_path, "w") as target, open(template_file_path) as source:
        template = source.read()
        controller_file_content = cstr(template).format(
            app_publisher=app_publisher,
            year=now_datetime().year,
            classname=doc.name.replace(" ", "").replace("-", ""),
            base_class_import=base_class_import,
            base_class=base_class,
            doctype=doc.name,
            **opts,
            custom_controller=controller_body,
        )
        target.write(frappe.as_unicode(controller_file_content))