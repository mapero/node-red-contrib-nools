var nools = require("nools");

var Message = function(packet) {
	this.updatePayload = function(packet) {
		this.p_previous = this.p;
		this.p = packet.payload;
		this.changed = this.p_previous != this.p;
		this.retained = packet.retain;
		this.lastChange = this.currentChange;
		this.currentChange = new Date();
	}

	this.changedFromTo = function(from, to) {
		return this.p_previous == from && this.p == to;
	}

	this.t = packet.topic;
	this.updatePayload(packet);
	this.currentChange = new Date();
	this.lastChange = undefined;
};

module.exports = function(RED) {

	function NoolsFlowNode(n) {
		RED.nodes.createNode(this,n);
		var node = this;

		node.topic = n.topic;

		node.publish = function(payload, topic) {
			var t = topic ? topic : node.topic;
			node.send({topic: t, payload: payload});
		}

		node.flow = nools.compile(n.flow, {
			name: n.name,
			define: {
				Message: Message,
				publish: node.publish
			}
		});

		node.session = node.flow.getSession();
		node.messages = {};

		node.on("close", function() {
			nools.deleteFlow(n.name);
		});

		node.session.on("fire", function(name, rule) {
			node.log("Rule fired: "+name);
		});

		node.on("input", function(msg) {
			if(msg.topic in node.messages) {
				var m = node.messages[msg.topic];
				if(msg.payload) {
					m.updatePayload(msg);
					node.session.modify(m);
				} else {
					node.session.retract(m);
				}

			} else {
				if(!msg.payload) {
					return;
				}
				var m = new Message(msg);
				node.messages[msg.topic] = m;
				node.session.assert(m);
			}
			node.session.match();
		});

	};

	RED.nodes.registerType("nools-flow", NoolsFlowNode);
}
