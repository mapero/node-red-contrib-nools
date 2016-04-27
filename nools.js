var nools = require("nools");

// Constructor for the message class
var Message = function(packet) {
	this.updatePayload = function(packet) {
		this.p_previous = this.p;
		this.p = packet.payload;
		this.changed = this.p_previous != this.p;
		this.retained = packet.retain;
		this.lastChange = this.currentChange;
		this.currentChange = new Date();
	};

	this.changedFromTo = function(from, to) {
		return this.changed && this.p_previous == from && this.p == to;
	};
	this.changedTo = function(to) {
		return this.changed && this.p == to;
	};
	this.changedFrom = function(from) {
		return this.changed && this.p_previous == from;
	};

	this.t = packet.topic;
	this.updatePayload(packet);
	this.currentChange = new Date();
	this.lastChange = undefined;

	//aliases
	this.payload = this.p;
	this.topic = this.t;
};

// Constructor for the clock class
var Clock = function(){
    this.date = new Date();

    this.getHours = function() {
        return this.date.getHours();
    };

    this.getMinutes = function() {
        return this.date.getMinutes();
    };

    this.hoursIsBetween = function(a, b) {
			if(a <= b) return this.date.getHours() >= a && this.date.getHours() <=b;
			else return this.date.getHours() >= a || this.date.getHours() <= b;
    };

    this.step = function(){
        this.date = new Date();
        this.isMorning = this.hoursIsBetween(6, 11);
        this.isNoon = this.hoursIsBetween(12, 14);
        this.isAfternoon = this.hoursIsBetween(15, 17);
        this.isEvening = this.hoursIsBetween(18, 23);
        this.isNight = this.hoursIsBetween(0,5);
        return this;
    };
};

module.exports = function(RED) {

	function NoolsAssert(n) {
		RED.nodes.createNode(this,n);
		var node = this;

		node.session = RED.nodes.getNode(n.session).session;
		node.messages = RED.nodes.getNode(n.session).messages;
		node.clock = RED.nodes.getNode(n.session).clock;

		node.on("input", function(msg) {
			if(!msg.topic) {
				node.warn("Topic must be defined!");
				return;
			}

			if(msg.topic in node.messages) {
				var m = node.messages[msg.topic];
				if(msg.payload !== undefined) {
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
			node.session.modify(node.clock);
			node.session.match();
		});
	}
	RED.nodes.registerType("nools-assert", NoolsAssert);


////////////////////////////////////////////////////////////////////////////////
// NoolsFire: Output node of a nools flow                                     //
////////////////////////////////////////////////////////////////////////////////

	function NoolsFire(n) {
		RED.nodes.createNode(this,n);
		var node = this;

		node.name = n.name;
		node.topic = n.topic;

		node.session = RED.nodes.getNode(n.session).session;
		node.messages = RED.nodes.getNode(n.session).messages;
		RED.nodes.getNode(n.session).on("publish", function(msg) {
			if( !node.topic || node.topic === msg.topic) {
				node.send(msg);
			}
		});

		node.session.on("fire", function(name, rule) {
			node.send([null, {
				topic: node.topic,
				payload: name,
				facts: node.session.getFacts(),
				name: name
			}]);
		});
	}
	RED.nodes.registerType("nools-fire", NoolsFire);

////////////////////////////////////////////////////////////////////////////////
// NoolsFlowNode: Configuration node containing the flow and session          //
////////////////////////////////////////////////////////////////////////////////

	function NoolsFlowNode(n) {
		RED.nodes.createNode(this,n);
		var node = this;

		// node.messages contains all messages received by any assert node
		node.messages = {};
		node.clock = new Clock();

		var publish = function(msg) {
			node.emit("publish", msg);
		};

		node.flow = nools.compile(n.flow, {
			name: n.id,
			define: {
				Message: Message,
				Clock: Clock,
				publish: publish
			}
		});
		node.session = node.flow.getSession();
		node.session.assert(node.clock);

		//Run once for init
		node.session.match();

		node.on("close", function() {
			node.session.dispose();
			nools.deleteFlow(n.id);
		});

	}
	RED.nodes.registerType("nools-flow", NoolsFlowNode);
};
