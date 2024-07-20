# Copyright (c) 2024, DAS and contributors
# For license information, please see license.txt

import frappe
from frappe.modules.export_file import export_to_files
from frappe.model.document import Document

from devextreme.modules.utils import make_boilerplate

class DevextremeReport(Document):
	
	def validate(self):
		"""only administrator can save standard report"""
		if not self.module:
			self.module = frappe.db.get_value("DocType", self.ref_doctype, "module")

	def before_insert(self):
		self.set_doctype_roles()

	def on_update(self):
		self.export_doc()
	
	def export_doc(self):
		if frappe.flags.in_import:
			return

		if (frappe.local.conf.get("developer_mode") or 0) == 1:
			export_to_files(record_list=[["Devextreme Report", self.name]], record_module=self.module, create_init=True)

			self.create_report_py()

	def create_report_py(self):
		make_boilerplate("controller.py", self, {"name": self.name})
		make_boilerplate("controller.js", self, {"name": self.name})

	@frappe.whitelist()
	def set_doctype_roles(self):
		if not self.get("roles"):
			meta = frappe.get_meta(self.ref_doctype)
			if not meta.istable:
				roles = [{"role": d.role} for d in meta.permissions if d.permlevel == 0]
				self.set("roles", roles)

	def is_permitted(self):
		"""Returns true if Has Role is not set or the user is allowed."""
		from frappe.utils import has_common

		allowed = [d.role for d in frappe.get_all("Has Role", fields=["role"], filters={"parent": self.name})]

		if not allowed:
			return True

		if has_common(frappe.get_roles(), allowed):
			return True
