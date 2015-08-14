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

var Clock = function(){
    this.date = new Date();

    this.getHours = function() {
        return this.date.getHours();
    }

    this.getMinutes = function() {
        return this.date.getMinutes();
    }

    this.hoursIsBetween = function(a, b) {
        return this.date.getHours() >= a && this.date.getHours() <=b;
    }

    this.step = function(){
        this.date = new Date();
        this.isMorning = this.hoursIsBetween(6, 11);
        this.isNoon = this.hoursIsBetween(12, 14);
        this.isAfternoon = this.hoursIsBetween(15, 17);
        this.isEvening = this.hoursIsBetween(18, 23);
        this.isNight = this.hoursIsBetween(0,5);
        return this;
    }
}

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
				Clock: Clock,
				log: node.log,
				publish: node.publish
			}
		});

		node.session = node.flow.getSession();
		node.messages = {};

		//Run once for init
		node.session.match();

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
