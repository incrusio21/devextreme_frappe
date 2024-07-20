// Copyright (c) 2024, DAS and Contributors
// MIT License. See license.txt

frappe.provide("dxextreme.views");
frappe.provide("dxextreme.query_reports");

frappe.standard_pages["devextreme-query-report"] = function () {
	var wrapper = frappe.container.add_page("devextreme-query-report");

	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Devextreme Report"),
		single_column: true,
	});

	dxextreme.query_report = new dxextreme.views.QueryReport({
		parent: wrapper,
	});

	$(wrapper).bind("show", function () {
		dxextreme.query_report.show();
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

		let tasks = [
			this.setup_defaults,
			this.setup_page,
			this.setup_report_wrapper,
			this.setup_events,
		].map((fn) => fn.bind(this));
		this.init_promise = frappe.run_serially(tasks);
		return this.init_promise;
	}

	setup_defaults() {
		this.route = frappe.get_route();
		this.page_name = frappe.get_route_str();

		// Setup buttons
		this.primary_action = null;

		// throttle refresh for 300ms
		this.refresh = frappe.utils.throttle(this.refresh, 300);

		this.ignore_prepared_report = false;
		this.menu_items = [];
	}

	set_default_secondary_action() {
		this.refresh_button && this.refresh_button.remove();
		this.refresh_button = this.page.add_action_icon(
			"es-line-reload",
			() => {
				this.setup_progress_bar();
				this.refresh();
			},
			"",
			__("Reload Report")
		);
	}

	setup_events() {
		frappe.realtime.on("report_generated", (data) => {
			this.toggle_primary_button_disabled(false);
			if (data.report_name) {
				this.prepared_report_action = "Rebuild";
				// If generated report and currently active Prepared Report has same fiters
				// then refresh the Prepared Report
				// Otherwise show alert with the link to the Prepared Report
				if (data.name == this.prepared_report_doc_name) {
					this.refresh();
				} else {
					let alert_message = `Report ${this.report_name} generated.
						<a href="#query-report/${this.report_name}/?prepared_report_name=${data.name}">View</a>`;
					frappe.show_alert({ message: alert_message, indicator: "orange" });
				}
			}
		});
		this.page.wrapper.on("click", "[data-action]", (e) => {
			let action_name = $(e.currentTarget).data("action");
			let action = this[action_name];
			if (action.call) {
				action.call(this, e);
			}
		});
	}
	
	load() {
		if (frappe.get_route().length < 2) {
			this.toggle_nothing_to_show(true);
			return;
		}
		
		let route_options = {};
		route_options = Object.assign(route_options, frappe.route_options);
		
		if (this.report_name !== frappe.get_route()[1]) {
			// different report
			this.load_report(route_options);
		} else if (frappe.has_route_options()) {
			// filters passed through routes
			// so refresh report again
			this.refresh_report(route_options);
		} else {
			// same report
			// don't do anything to preserve state
			// like filters and datatable column widths
		}
	}
	
	load_report(route_options) {
		this.page.clear_inner_toolbar();
		this.route = frappe.get_route();
		this.page_name = frappe.get_route_str();
		this.report_name = this.route[1];
		this.page_title = __(this.report_name);
		this.show_save = false;
		this.menu_items = this.get_menu_items();
		this.datatable = null;
		this.prepared_report_action = "New";

		frappe.run_serially([
			() => this.get_report_doc(),
			() => this.get_report_settings(),
			() => this.setup_progress_bar(),
			() => this.setup_page_head(),
			() => this.refresh_report(route_options),
			() => this.add_chart_buttons_to_toolbar(true),
			() => this.add_card_button_to_toolbar(true),
		]);
	}

	refresh_report(route_options) {
		this.prepared_report_name = null; // this should be set only if prepared report is EXPLICITLY requested
		this.toggle_message(true);
		this.toggle_report(false);

		// return frappe.run_serially([
		// 	() => this.setup_filters(),
		// 	() => this.set_route_filters(route_options),
		// 	() => this.page.clear_custom_actions(),
		// 	() => this.report_settings.onload && this.report_settings.onload(this),
		// 	() => this.refresh(),
		// ]);
	}

	get_report_doc() {
		return frappe.model
			.with_doc("Devextreme Report", this.report_name)
			.then((doc) => {
				this.report_doc = doc;
			})
			.then(() => frappe.model.with_doctype(this.report_doc.ref_doctype));
	}

	get_report_settings() {
		return new Promise((resolve, reject) => {
			if (dxextreme.query_reports[this.report_name]) {
				this.report_settings = dxextreme.query_reports[this.report_name];
				resolve();
			} else {
				frappe
					.xcall("devextreme.desk.query_report.get_script", {
						report_name: this.report_name,
					})
					.then((settings) => {
						frappe.dom.eval(settings.script || "");
						frappe.after_ajax(() => {
							this.report_settings = dxextreme.query_reports[this.report_name]
							this.report_settings.html_format = settings.html_format;
							this.report_settings.execution_time = settings.execution_time || 0;
							dxextreme.query_reports[this.report_name] = this.report_settings;

							if (this.report_doc.filters && !this.report_settings.filters) {
								// add configured filters
								this.report_settings.filters = this.report_doc.filters;
							}

							resolve();
						});
					})
					.catch(reject);
			}
		});
	}

	setup_progress_bar() {
		let seconds_elapsed = 0;
		const execution_time = this.report_settings.execution_time || 0;

		if (execution_time < 5) return;

		this.interval = setInterval(function () {
			seconds_elapsed += 1;
			frappe.show_progress(__("Preparing Report"), seconds_elapsed, execution_time);
		}, 1000);
	}

	set_breadcrumbs() {
		if (!this.report_doc || !this.report_doc.ref_doctype) return;
		const ref_doctype = frappe.get_meta(this.report_doc.ref_doctype);
		frappe.breadcrumbs.add(ref_doctype.module);
	}

	get_menu_items() {
		let items = [
			{
				label: __("Refresh"),
				action: () => this.refresh(),
				class: "visible-xs",
			},
			{
				label: __("Edit"),
				action: () => frappe.set_route("Form", "Devextreme Report", this.report_name),
				condition: () => frappe.user.is_report_manager(),
				standard: true,
			},
			{
				label: __("Print"),
				action: () => {
					let dialog = frappe.ui.get_print_settings(
						false,
						(print_settings) => this.print_report(print_settings),
						this.report_doc.letter_head,
						this.get_visible_columns()
					);
					this.add_portrait_warning(dialog);
				},
				condition: () => frappe.model.can_print(this.report_doc.ref_doctype),
				standard: true,
			},
			{
				label: __("PDF"),
				action: () => {
					let dialog = frappe.ui.get_print_settings(
						false,
						(print_settings) => this.pdf_report(print_settings),
						this.report_doc.letter_head,
						this.get_visible_columns()
					);

					this.add_portrait_warning(dialog);
				},
				condition: () => frappe.model.can_print(this.report_doc.ref_doctype),
				standard: true,
			},
			{
				label: __("Export"),
				action: () => this.export_report(),
				condition: () => frappe.model.can_export(this.report_doc.ref_doctype),
				standard: true,
			},
			{
				label: __("Setup Auto Email"),
				action: () =>
					frappe.set_route("List", "Auto Email Report", { report: this.report_name }),
				standard: true,
			},
			{
				label: __("User Permissions"),
				action: () =>
					frappe.set_route("List", "User Permission", {
						doctype: "Devextreme Report",
						name: this.report_name,
					}),
				condition: () => frappe.user.has_role("System Manager"),
				standard: true,
			},
		];

		return items;
	}

	setup_report_wrapper() {
		if (this.$report) return;

		// Remove border from
		$(".page-head-content").removeClass("border-bottom");

		let page_form = this.page.main.find(".page-form");
		this.$status = $(`<div class="form-message text-muted small"></div>`)
			.hide()
			.insertAfter(page_form);

		this.$summary = $(`<div class="report-summary"></div>`).hide().appendTo(this.page.main);

		this.$chart = $('<div class="chart-wrapper">').hide().appendTo(this.page.main);

		this.$loading = $(this.message_div("")).hide().appendTo(this.page.main);
		this.$report = $('<div class="report-wrapper">').appendTo(this.page.main);
		this.$message = $(this.message_div("")).hide().appendTo(this.page.main);
	}

	message_div(message) {
		return `<div class='flex justify-center align-center text-muted' style='height: 50vh;'>
			<div>${message}</div>
		</div>`;
	}

	toggle_message(flag, message) {
		if (flag) {
			this.$message.find("div").html(message);
			this.$message.show();
		} else {
			this.$message.hide();
		}
	}

	toggle_report(flag) {
		this.$report.toggle(flag);
		this.$chart.toggle(flag);
		this.$summary.toggle(flag);
	}
}