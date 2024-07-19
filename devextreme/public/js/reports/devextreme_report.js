// Copyright (c) 2018, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide("dxextreme.views");
frappe.provide("dxextreme.query_reports");

frappe.standard_pages["devextreme-report"] = function () {
	var wrapper = frappe.container.add_page("devextreme-report");

	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Devextreme Report"),
		single_column: true,
	});

	dxextreme.query_reports = new dxextreme.views.QueryReport({
		parent: wrapper,
	});

	$(wrapper).bind("show", function () {
		dxextreme.query_reports.show();
	});
};

dxextreme.views.QueryReport = class QueryReport extends frappe.views.BaseList {
	show() {
		this.init().then(() => this.load());
	}

	init() {
		if (this.init_promise) {
			return this.init_promise;
		}

		// let tasks = [
		// 	this.setup_defaults,
		// 	this.setup_page,
		// 	this.setup_report_wrapper,
		// 	this.setup_events,
		// ].map((fn) => fn.bind(this));
		// this.init_promise = frappe.run_serially(tasks);
		// return this.init_promise;
	}
}