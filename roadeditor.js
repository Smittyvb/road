
var size = {width: 1000, height:400};
var padding = {left:40, right:10, top:30, bottom:30};
var plotsize = {width: size.width-padding.left-padding.right, height: size.height-padding.top-padding.bottom};

// rawknots includes the start date and value, subsequent date/value
// pairs, and the last entry is the goal date and value
var rawknots = [[1441606400,0], [1454284800,2], [1457284800,5], [1460284800,0], [1563284800,-100]];
// knots array is initialized and updated by us. Each entry encodes a
// segment of the road in the form [startdate, startvalue, enddate,
// endvalue, slope]. The first and last entries encode flat segments
// at the beginning and end of the overall road.
var knots = [];
function initializeKnotArray() {
    var nk = rawknots.length - 1;
    for (var i = 0; i < nk; i++) {
        var slope =  (rawknots[i+1][1] - rawknots[i][1]) 
                / (rawknots[i+1][0] - rawknots[i][0]);
        knots.push(rawknots[i].concat(rawknots[i+1]));
        knots[knots.length-1].push(slope);
    }
    var firstsegment = [knots[0][0]-10*365*24*60*60, knots[0][1], 
                        knots[0][0], knots[0][1], 0];
    var lastsegment = [knots[nk-1][2], knots[nk-1][3], 
                       knots[nk-1][2]+10*365*24*60*60, knots[nk-1][3], 0];
    knots.push(lastsegment);
    knots.unshift(firstsegment);
}
initializeKnotArray();

// Create and initialize the SVG chart and its components
var chart = d3.select('.content')
	.append('svg:svg')
	.attr('width', size.width)
	.attr('height', size.height)
	.attr('id', 'roadchart')
	.attr('class', 'chart');
chart.append('def').append("clipPath")
    .attr("id", "clipper")
    .append("rect")
    .attr("x", padding.left)
    .attr("y", padding.top)
    .attr("width", plotsize.width)
    .attr("height", plotsize.height);

// Create a rectange to monitor zoom events and install initial handlers
var zoomarea = chart.append('rect')
        .attr("class", "zoomarea")
        .attr("x", padding.left).attr("y", padding.top)
        .attr("width", plotsize.width).attr("height", plotsize.height);
var xzoomarea = chart.append('rect')
        .attr("class", "axiszoom")
        .attr("x", padding.left).attr("y", plotsize.height+padding.top)
        .attr("width", plotsize.width).attr("height", padding.bottom);
var yzoomarea = chart.append('rect')
        .attr("class", "axiszoom")
        .attr("x", 0).attr("y", padding.top)
        .attr("width", padding.left).attr("height", plotsize.height);
var axisZoom = d3.zoom()
        .scaleExtent([1, Infinity])
        .extent([[0, 0], [plotsize.width, plotsize.height]])
        .translateExtent([[0, 0], [plotsize.width, plotsize.height]])
        .on("zoom", updateZoom);
zoomarea.call(axisZoom);

// Create plotting area above the zooming area so points can be selected
var plot = chart.append('g')
	    .attr('class', 'main')
        .attr('clip-path', 'url(#clipper)')
        .append('g')
        .attr('transform', 'translate('+padding.left+','+padding.top+')')
        .append('g')
	    .attr('class', 'plot');

// Define and compute limits of current data
var xMin=Infinity,xMax=-Infinity;
var yMin=Infinity,yMax=-Infinity;

function recomputeDataLimits(allowShrink = false) {
    var firstRun = !Number.isFinite(xMin);

    // Save old limits so we can figure out how much to extend scale
    // extent for zoom
    var xMinOld = xMin, xMaxOld = xMax;
    var yMinOld = yMin, yMaxOld = yMax;

    // Compute new limits for the current data
    xMin = d3.min(knots, function(d) { return d[2]; });
    xMax = d3.max(knots, function(d) { return d[0]; });
    yMin = d3.min(knots, function(d) { return d[1]; });
    yMax = d3.max(knots, function(d) { return d[1]; });
    // Extend limits by 5% so everything is visible
    xMin = xMin - 0.05*(xMax - xMin);
    xMax = xMax + 0.15*(xMax - xMin);
    yMin = yMin - 0.05*(yMax - yMin);
    yMax = yMax + 0.05*(yMax - yMin);

    // Make sure we never shrink allowable zoom extent (unless
    // requested) since that causes jumpy behavior
    if (!allowShrink) {
        xMin = d3.min([xMin, xMinOld]);
        xMax = d3.max([xMax, xMaxOld]);
        yMin = d3.min([yMin, yMinOld]);
        yMax = d3.max([yMax, yMaxOld]);
    }
    
    if (!firstRun) {
        // After initialization, update the zoom scale extent if the
        // data limits have been extended.
        var curScales = axisZoom.scaleExtent();
        curScales[0] = curScales[0] 
            * d3.min([(xMaxOld - xMinOld) / (xMax - xMin),
                      (yMaxOld - yMinOld) / (yMax - yMin)]);
        axisZoom.scaleExtent(curScales);
        axisZoom.translateExtent([[xScale(xMin*1000), yScale(yMax)], 
                                  [xScale(xMax*1000), yScale(yMin)]]);
    }
}
recomputeDataLimits( );

// Create and initialize the x and y axes
var xScale = d3.scaleTime()
        .domain([new Date(xMin*1000), new Date(xMax*1000)])
        .range([0,plotsize.width]);
var xAxis = d3.axisBottom(xScale).ticks(6);
var xAxisObj = chart.append('g')        
        .attr("class", "axis")
        .attr("transform", "translate("+padding.left+"," + (size.height - padding.bottom) + ")")
        .call(xAxis);
var yScale = d3.scaleLinear()
        .domain([yMin, yMax])
        .range([plotsize.height, 0]);
var yAxis = d3.axisLeft(yScale);
var yAxisObj = chart.append('g')        
        .attr("class", "axis")
        .attr("transform", "translate(" + padding.left + ","+padding.top+")")
        .call(yAxis);

// These keep the current scaling factors for x and y axes
var xFactor = 1, yFactor = 1;
// These are the updated scale objects based on the current transform
var newXScale = xScale, newYScale = yScale;

function updateZoom() {
    // Inject the current transform into the plot element
    var tr = d3.event.transform;
    if (tr == null) return;

    plot.attr("transform", tr);

    // Rescale x and y axes
    newXScale = tr.rescaleX(xScale);
    newYScale = tr.rescaleY(yScale);
    xAxisObj.call(xAxis.scale(newXScale));
    yAxisObj.call(yAxis.scale(newYScale));

    // Compute scaling factors and adjust translation limits for zooming
    xFactor = tr.applyX(1) - tr.applyX(0);
    yFactor = tr.applyY(1) - tr.applyY(0);
    axisZoom.translateExtent([[xScale(xMin*1000), yScale(yMax)], 
                              [xScale(xMax*1000), yScale(yMin)]]);
    // Readjust point sizes and line widths with the current scale
    plot.selectAll("line.roads").style("stroke-width",2/xFactor);
    plot.selectAll("line.knots").style("stroke-width",3/xFactor);
    plot.selectAll("circle.dots").attr("r",5/xFactor);
    plot.selectAll("circle.dots").style("stroke-width",1/xFactor);
}

function recomputeKnotArray() {
    var nk = knots.length-1;
    for (var i = 0; i < nk; i++) {
        knots[i+1][1] = knots[i][1] + knots[i][4]*(knots[i+1][0] - knots[i][0]);
        knots[i][2] = knots[i+1][0];
        knots[i][3] = knots[i+1][1];
    }
    knots[nk][3] = knots[nk][1];
}

function inrange(x, min, max) {
  return x >= min && x <= max;
}

var knotsave, knotmin, knotmax;
function knotdragstarted(d) {
	d3.event.sourceEvent.stopPropagation();
    var knotindex = Number(this.id);
	knotmin = (knotindex == 0) ? xMin : (knots[knotindex-1][0]) + 0.01;
	knotmax = (knotindex == knots.length-1) ? knots[knotindex][2]-0.01:(knots[knotindex+1][0])-0.01;
    knotsave = knots.map(function(arr){return arr.slice();});
};
function knotdragged(d) {
	var x = d3.event.x;
	if (inrange(xScale.invert(x)/1000, knotmin, knotmax)) {
        d3.select(this).attr("stroke","rgb(255,180,0)");
        var knotindex = Number(this.id);
        i = knotindex;
        //for (i = knotindex; i < knots.length; i++) {
	    knots[i][0] = knotsave[i][0] + xScale.invert(x)/1000 - knotsave[knotindex][0];
        //}
        recomputeKnotArray();
        for (i = 0; i < knots.length; i++) {
		    d3.select("[name=knot"+i+"]")
			    .attr("x1", xScale(knots[i][0]*1000))
			    .attr("x2", xScale(knots[i][0]*1000));
		    d3.select("[name=dot"+i+"]")
			    .attr("cx", xScale(knots[i][0]*1000))
			    .attr("cy", yScale(knots[i][1]));
		    d3.select("[name=road"+i+"]")
			    .attr("x1", xScale(knots[i][0]*1000))
			    .attr("x2", xScale(knots[i][3]*1000))
			    .attr("y1", yScale(knots[i][1]))
			    .attr("y2", yScale(knots[i][4]));
        }
        updateData();
    }
};
function knotdragended(d){
	d3.select(this).attr("stroke","rgb(200,200,200)");
    recomputeDataLimits();
    updateData();
};

function updateData() {

    // Create, update and delete vertical knot lines
    kn = plot.selectAll("line.knots").data(knots);
    kn.attr("y1",yScale(yMin - 10*(yMax-yMin)))
		.attr("y2",yScale(yMax + 10*(yMax-yMin)))
		.attr("x1", function(d){ return xScale(d[0]*1000)})
		.attr("x2", function(d){ return xScale(d[0]*1000)});
    kn.exit().remove();
    kn.enter().append("svg:line")
		.attr("class","knots")
		.attr("y1",yScale(yMin))
		.attr("y2",yScale(yMax))
		.attr("x1", function(d){ return xScale(d[0]*1000)})
		.attr("x2", function(d){ return xScale(d[0]*1000)})
		.attr("stroke", "rgb(200,200,200)") 
		.style("stroke-width",3/xFactor)
		.attr("id", function(d,i) {return i;})
		.attr("name", function(d,i) {return "knot"+i;})
		.on("mouseover",function() {
			d3.select(this).style("stroke-width",6/xFactor);})
		.on("mouseout",function() {
			d3.select(this).style("stroke-width",3/xFactor);})
        .call(d3.drag()
              .on("start", knotdragstarted)
              .on("drag", knotdragged)
              .on("end", knotdragended));

    // Create, update and delete road lines
    kn = plot.selectAll("line.roads").data(knots);
    kn.attr("y1",function(d){ return yScale(d[1]);})
		.attr("y2",function(d){ return yScale(d[3]);})
		.attr("x1", function(d){ return xScale(d[0]*1000);})
		.attr("x2", function(d){ return xScale(d[2]*1000);})
		.style("stroke-width",2/xFactor);
    
    kn.exit().remove();
    kn.enter().append("svg:line")
		.attr("class","roads")
		.attr("y1",function(d){ return yScale(d[1]);})
		.attr("y2",function(d){ return yScale(d[3]);})
		.attr("x1", function(d){ return xScale(d[0]*1000);})
		.attr("x2", function(d){ return xScale(d[2]*1000);})
		.style("stroke-width",2/xFactor)
		.attr("id", function(d,i) {return i;})
		.attr("name", function(d,i) {return "road"+i;});

    // Create, update and delete inflection points
    kn = plot.selectAll("circle.dots").data(knots);
    kn.attr("cy",function(d){ return yScale(d[1]);})
		.attr("cx", function(d){ return xScale(d[0]*1000);})
		.attr("stroke-width", 1/xFactor);
    kn.exit().remove();
    kn.enter().append("svg:circle")
		.attr("class","dots")
		.attr("cy",function(d){ return yScale(d[1]);})
		.attr("cx", function(d){ return xScale(d[0]*1000);})
		.style("stroke-width", 1/xFactor) 
		.attr("r",5/xFactor)
		.attr("id", function(d,i) {return i;})
		.attr("name", function(d,i) {return "dot"+i;});

}

// Reset button restores zooming transformation to identity
function zoomOut() {
    recomputeDataLimits(true);
    xFactor = 1; yFactor = 1;
    xScale.domain([new Date(xMin*1000), new Date(xMax*1000)])
        .range([0,plotsize.width]);
    yScale.domain([yMin, yMax])
        .range([plotsize.height, 0]);
    newXScale = xScale; newYScale = yScale;
    axisZoom.scaleExtent([1, Infinity])
        .extent([[0, 0], [plotsize.width, plotsize.height]])
        .translateExtent([[0, 0], [plotsize.width, plotsize.height]]);
    zoomarea.call(axisZoom.transform, d3.zoomIdentity);
    updateData();
}
d3.select("button#zoomout").on("click", zoomOut);

// Reset button restores zooming transformation to identity
function resetZoom() {
    xFactor = 1; yFactor = 1;
    newXScale = xScale; newYScale = yScale;
    zoomarea.call(axisZoom.transform, d3.zoomIdentity);
}
d3.select("button#reset").on("click", resetZoom);

// Saving the current zoom updates x and y scale objects and resets
// the zoom transform to identity afterwards. This also requires an
// update to data elements
function saveZoom() {
    var curScale = axisZoom.scaleExtent();
    axisZoom.scaleExtent([curScale[0]/xFactor, curScale[1]/yFactor]);
    xFactor = 1; yFactor = 1;
    xScale = newXScale; yScale = newYScale;
    zoomarea.call(axisZoom.transform, d3.zoomIdentity);
    // This ensures that data components are moved to their new coordinates
    updateData();
}
d3.select("button#savezoom").on("click", saveZoom);

updateData();

//self.setInterval(function() {data.push([10*Math.random(), 10*Math.random()]); updateData();}, 100);
