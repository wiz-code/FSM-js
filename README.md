# FSM-js
JavaScriptによるステートマシン実装のためのライブラリです。
# 使い方の例
var machine = new FSM('machine');

var stateFirst = new State('state-first', {
	autoTransition: true
});
var stateSecond = new State('state-second');

var firstTransition = new Transition('first-transition', null, 'state-first');
var secondTransition = new Transition('second-transition', 'state-first', 'state-second');

machine.addState(stateFirst);
machine.addState(stateSecond);

machine.addTransition(firstTransition);
machine.addTransition(secondTransition);

machine.start();
