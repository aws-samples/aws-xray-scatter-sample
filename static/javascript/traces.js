"use strict";

const traces = {};

traces.table = null;

traces.tableOptions = function() {
	return {
		columns: [
			{ data: "http_url" },
			{
				data: "response_time",
				render: $.fn.dataTable.render.number(',', '.', 3, '', ' s'),
			},
			{ data: "http_status" },
			{
                data: "users",
				render: function (data, type, row) {
				        return data.join(", ");
				},
            },
			{
				data: "timeline_link",
				orderable: false,
				render: function (data, type, row) {
				        return "<a href=\"" + data + "\">" + "Console" + '</a>';
				},
				width: "10px"
			},
			{
			    className: 'details-control',
			    orderable: false,
			    data: null,
			    defaultContent: '',
				width: "10px"
			},
			{ data: "timestamp" },
			{ data: "annotations" },
			{ data: "trace_id" },
		],
		paging: false,
		deferRender: true,
		select: {
			style: 'single',
			items: 'cell',
			info: false,
		},
		columnDefs: [
		    {
				visible: false,
				searchable: true,
				targets: [6, 7, 8] // timestamp, annotations and trace_id
			}
		],
		order: [[6, "asc"]],
		dom: "lrtip",
		tabIndex: -1,
        language: {
              emptyTable: "Select a time range to view traces"
        },
        // rowGroup: {
        //     dataSrc: "http_status"
        // }
	};
};

// Initialize https://datatables.net table used to display traces that match a selection.
traces.init = function() {
	traces.table = $('#traceTable').DataTable(traces.tableOptions());

	$('#traceTable tbody').on('click', 'td.details-control', function() {
		var tr = $(this).closest('tr');
	        var row = traces.table.row( tr );

	        if (row.child.isShown() ) {
	            row.child.hide();
	            tr.removeClass('shown');
	        }
	        else {
	            row.child(traces.formatDetailsRow(row.data())).show();
	            tr.addClass('shown');
	        }
	});
};

traces.clear = function() {
    if (traces.table) {
    	traces.table.clear().columns.adjust().draw();
    }
};

traces.update = function(data) {
    document.getElementById('traceTable_wrapper').style.display = "";
    document.getElementById('tracesLoading').style.display = "none";

	console.log(data);

	traces.table.clear().rows.add(data.traces).columns.adjust().draw();
};

traces.showProgress = function() {
    document.getElementById('traceTable_wrapper').style.display = "none";
    document.getElementById('tracesLoading').style.display = "block";
    traces.clear();    
};

traces.formatDetailsRow = function(d) {
	console.log(d);
	const annotationsFormatted = _.chain(d.annotations)
                                      .mapKeys(function(v, k) {
									  v = v.join('<br>')
									  return "<tr><td><b>" + k + "</b></td>" + "<td width='50px' style='text-align:center;'>&#8594;</td>" + "<td>" + v + "</td></tr>";
								  })
	                              .keys();

	return '<table cellpadding="5" cellspacing="0" border="0" style="padding-left:50px;">'+
	        '<tr>'+
	            '<td><b>Trace ID</b></td>'+
	            '<td>'+d.trace_id+'</td>'+
	        '</tr>'+
	        '<tr>'+
	            '<td><b>URL</b></td>'+
	            '<td>'+d.http_url+'</td>'+
	        '</tr>'+
	        '<tr>'+
	            '<td><b>HTTP Status</b></td>'+
	            '<td>'+d.http_status+'</td>'+
	        '</tr>'+
	        '<tr>'+
	            '<td><b>Timestamp</b></td>'+
	            '<td>'+d.timestamp+'</td>'+
	        '</tr>'+
	        '<tr>'+
	            '<td><b>Annotations</b></td>'+
	            '<td><table id="annotations">'+annotationsFormatted.join('')+'</table></td>'+
	        '</tr>'+
	    '</table>';
};
