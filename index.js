(function(){

	let tbnNodes = d3.select("#tbnNodes");
	let threshInputs = d3.select("#thresholds")
	let boundsTreeNodes = d3.select("#boundsTreenodes");

	// We will model a chain of TBN nodes. Each has 2 CPTs: a and b. An evidence node will be the root of the chain 

	const evidenceNodeColor = "#92a8d1";

	class evidenceNode {
		constructor(output) {
			this.output = output;
			this.color = evidenceNodeColor;
			this.child = null;
		}

	}

	class CPT {
	  constructor(pGivenParent, pGivenNotParent) {
		this.pGivenTrue = pGivenParent;
		this.pGivenFalse = pGivenNotParent;
	  }
	}

	class boundsTreeRootNode {
		constructor(a, b){
			this.left = a;
			this.right = b;
			this.depth = -1;
			this.color = evidenceNodeColor;
		}

	}

	class boundsTreeNode {
		/*
		maximum output for one CPT is the largest output given any input which is all of the following:
			1) within parent bounds (given all ancestor's selected CPTs)
			2) within the threshold of the selected CPT  

			3) One of the boundaries found in steps 1 and 2, or the threshold of an ancestor node 
			(because between those points the computed function will be linear)

			- if no possible inputs meet all those conditions, 
		*/
		// compute bounds when constructing object
		// 		const aNode = new boundsTreeNode(1, 0, [], tbnRoot, "a", 0)
		constructor(parentMax, parentMin, ancestorThresholds, currentTBNNode, CPTSelection, depth) {
			// possible maximizing or minimizing inputs
			// console.log(ancestorThresholds)
			const inputs = [parentMax, parentMin, currentTBNNode.t].concat(ancestorThresholds);
			this.max_output = -1
			this.min_output = 2
			let i; 
			for (i in inputs){
				const input = inputs[i]
				if (input <= parentMax && input >= parentMin && ((CPTSelection == "a" && input >= currentTBNNode.t)||(CPTSelection == "b" && input <= currentTBNNode.t)) ){
					const cpt = (CPTSelection == "a" ? currentTBNNode.a : (CPTSelection == "b" ? currentTBNNode.b : null));
					const output = cpt.pGivenTrue * input + cpt.pGivenFalse * (1 - input);
					this.max_output = (output > this.max_output ? output : this.max_output);
					this.min_output = (output < this.min_output ? output : this.min_output);
				}
			}
			this.depth = depth
			// child nodes based on child's CPT selection. 
			// child selects A -> left
			// child selects B -> right 
			this.right = null
			this.left = null

			this.isDeadNode = (this.max_output == -1 || this.min_output == 2);
			this.color = (this.isDeadNode ? 'red' : 'green');
		}
	}

	function numDecisionTreeNodes(numTbnNodes){
		let ret = 0; 
		for (let i=0; i<=numTbnNodes; i++){
			ret += Math.pow(2, i); 
		}
		return ret

	}

	function computeBounds(tbnRoot) {
		if (tbnRoot == null) {
			return null;
		}

	  	// get thresholds of each node in tree
		const ancestorThresholds = [];
		const tbnNodes = []
		let tbnIter = tbnRoot;
		while(tbnIter != null){
			tbnNodes.push(tbnIter);
			ancestorThresholds.push(tbnIter.t);
			tbnIter = tbnIter.child
		}

		// bounds nodes associated with each CPT of the root node 
		let depth = 0

		const aNode = new boundsTreeNode(1, 0, [], tbnRoot, "a", depth)
		const bNode = new boundsTreeNode(1, 0, [], tbnRoot, "b", depth)
		const rootNode = new boundsTreeRootNode(aNode, bNode)
		const numNodesToAdd = numDecisionTreeNodes(tbnNodes.length)-3; // -3 since aNode, bNode, and rootNode have been included already

		const toVisit = [aNode, bNode]
		let current = toVisit.shift()

		for(let i=0; i<numNodesToAdd; i+=2){
			depth = current.depth+1

			if (current.isDeadNode ==  true){
				let nextNodeA = new boundsTreeNode(-1, 2, [], tbnNodes[depth-1], "a", depth);
				current.left = nextNodeA;
				toVisit.push(nextNodeA);

				let nextNodeB = new boundsTreeNode(-1, 2, [], tbnNodes[depth-1], "b", depth);
				current.right = nextNodeB;
				toVisit.push(nextNodeB);
			} else {
				let nextNodeA = new boundsTreeNode(current.max_output, current.min_output, ancestorThresholds.slice(0, depth-1), tbnNodes[depth-1], "a", depth);
				current.left = nextNodeA;
				toVisit.push(nextNodeA);

				let nextNodeB = new boundsTreeNode(current.max_output, current.min_output, ancestorThresholds.slice(0, depth-1), tbnNodes[depth-1], "b", depth);
				current.right = nextNodeB;
				toVisit.push(nextNodeB);

			}

			current = toVisit.shift();
		}
		// start iterating from root node. Compute thresholds for each CPT
		// then, compute thresholds for each combination of parent CPTs

		return rootNode;

	}

	class TBNNode {
	  constructor(CPTa, CPTb, Threshold, Parent) {
		this.a = CPTa;
		this.b = CPTb;
		this.t = Threshold;
		this.parent = Parent;
		this.child = null
		this.color = "gray";

		// initially set outputs to -1, these will be set to correct values by inference 
		this.output = -1.0;
	  }

	  inferOutput(parentOutput){
		//step 1: select CPT based on input and threshold
		let cpt = (parentOutput > this.t ? this.a : this.b);

		//step 2: set output based on input and CPT 
		return cpt.pGivenTrue * parentOutput + cpt.pGivenFalse * (1 - parentOutput);
	  }


	  inferBasedOnParentOutput(){
		const pOut = this.parent.output;

		// also set color based on which CPT is selected 
		this.color = (pOut > this.t ? "#b1cbbb" : "#eea29a");

		this.output = this.inferOutput(pOut);


	  }

	}

	const nodeRadius = 20;
	const nodeDistance = 120;
	const nodeOffset = 30;

	// precision of displayed output values 
	const precision = 3;
	const sliderWidth = 10000;
	// threshold value of each tbn node
	const thresholds = [];
 
	let numNodes = 0;
	let inputValue = 0.5;


	function generateVisualization() {
		const nodeYLoc = 60;

		tbnNodes.selectAll("circle").remove();
		tbnNodes.selectAll("text").remove();


		// set thresholds and threshold inputs for every node 
		//threshInputs.selectAll("input").remove();

		for (let i=0; i<numNodes; i++){
			if (thresholds[i] == null){
				thresholds[i] = 0.5;
			}
		}
		let thresholdData = threshInputs.selectAll("input").data(thresholds.slice(0, numNodes));
		thresholdData.exit().remove();
		let threshEnter = thresholdData.enter().append("input");

		threshEnter.attr("type", "range");
		threshEnter.attr("width", "30px");
		threshEnter.attr("min", 0);
		threshEnter.attr("max", sliderWidth);
		threshEnter.attr("id", function(d, i) {return i; });
		threshEnter.attr("defaultValue", 0.5 * sliderWidth);
		threshEnter.attr("value", function(d, i) {return thresholds[i] * sliderWidth; });
		threshEnter.attr("class", "thresholdInputSlider");

		let thresholdInputs = document.getElementsByClassName("thresholdInputSlider")
		let i;
		for (i in thresholdInputs) {
			thresholdInputs[i].oninput = processThreshValueChange;
		}

		let data = [new evidenceNode(inputValue)];
		for(let i =0; i< numNodes; i++){
			// default CPT values are set here
			const CPTa = new CPT(0.7, 0.5);
			const CPTb = new CPT(0.5, 0.3);

			const node = new TBNNode(CPTa, CPTb, thresholds[i], data[i]);
			data[i].child = node
			node.inferBasedOnParentOutput();
			data.push(node); 
		}

		let circle = tbnNodes.selectAll("circle");
		let circleData = circle.data(data);
		let circleEnter = circleData.enter().append("circle");

		circleEnter.attr("cy", nodeYLoc);
		circleEnter.attr("cx", function(d, i) { return i * nodeDistance + nodeOffset; });
		circleEnter.attr("fill", function(d, i) { return d.color; } );
		circleEnter.attr("r", function() { return nodeRadius; });


		let text = tbnNodes.selectAll("text");
		let textData = text.data(data);
		let textEnter = textData.enter().append("text");

		textEnter.attr("y", nodeYLoc + 4);
		textEnter.attr("fill", "black");
		textEnter.attr("x", function(d, i) { return i * nodeDistance + nodeOffset - 17; });
		textEnter.html(function(d) { return d.output.toPrecision(precision)});
	

		// open the input modal by clicking on any of the TBN nodes
		let inputModal = document.getElementById("editNodeModal");
		circleEnter.on("click", function() {
			inputModal.style.display = "block";
		});
		textEnter.on("click", function(){
			inputModal.style.display = "block";
		})
		let closeButton = document.getElementById("closeModal");
		closeButton.onclick = function(){
			inputModal.style.display = "none";
		}


		// visualize boundary tree as well 
		boundsTreeNodes.selectAll("circle").remove();
		boundsTreeNodes.selectAll("text").remove();


		const boundsTree = computeBounds(data[1]);
		if (boundsTree != null){
			// map every node in the bounds tree to an index using level-order traversal
			boundsNodeData = [boundsTree]
			let i=0;
			while(i < boundsNodeData.length){
				let next = boundsNodeData[i];
				if (next.left != null) {
					boundsNodeData.push(next.left);
				}
				if (next.right != null) {
					boundsNodeData.push(next.right);
				}
				i++;
			}

			let btnCircle = boundsTreeNodes.selectAll("circle");
			let btnCircleData = btnCircle.data(boundsNodeData);
			let btnCircleEnter = btnCircleData.enter().append("circle");

			btnCircleEnter.attr("cy", function(d, i) { let y = 60 * (d.depth+2); return y});
			btnCircleEnter.attr("cx", function(d, i) {
				const svgWidth = 1024;

				// weird edge case
				if (i==0) return svgWidth/2;

				// 1: compute which line node d is on 
				let lineNum = 0;
				let maxIndexOnThisLine = 0; 
				let maxIndexOnPrevLine = 0; 
				while (i > maxIndexOnThisLine){
					maxIndexOnPrevLine = maxIndexOnThisLine;
					lineNum += 1; 
					maxIndexOnThisLine += Math.pow(2, lineNum);
				} 				
				// 2: compute number of nodes on line lineNum
				let numNodesOnLine = maxIndexOnThisLine - maxIndexOnPrevLine;
				// 3: get index of node d in line lineNum
				let loc = maxIndexOnThisLine - i;

				let x = (svgWidth/(numNodesOnLine + 1)) * (loc +1)
				return x;
			});
			btnCircleEnter.attr("fill", function(d, i) { return d.color; } );
			btnCircleEnter.attr("r", function() { return nodeRadius; });
		}

	}

	function processNumNodesChange() {
		numNodes = this.value; 
		generateVisualization();
	}

	function processInputValueChange() {
		inputValue = this.value / sliderWidth; 
		document.getElementById("displayInputVal").innerHTML = inputValue.toPrecision(precision);
		generateVisualization();
	}

	function processThreshValueChange() {
		if(this.value != this.defaultValue){
			newThresh = this.value / sliderWidth; 
			thresholds[this.id] = newThresh;
			generateVisualization();
		}
	}

	document.getElementById("NumNodes").onchange = processNumNodesChange;
	document.getElementById("inputValue").oninput = processInputValueChange;

	window.onload = generateVisualization;

}());
