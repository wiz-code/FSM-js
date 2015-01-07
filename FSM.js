/*
 * FSM.js
 * version 0.5.0
 * Copyright (c) 2014 Masa (http://wiz-code.digick.jp)
 * 
 * LICENSE: MIT license
 * http://wiz-code.digick.jp/dev/MIT-LICENSE.txt
 */


/***********************************************************************************************************
 * 追加・修正箇所:
 * ユーティリティ関数を削除し、Underscore.jsに依存
 * 
 * 使用可能な機能: コンポジット状態・直交状態・浅い（深い）履歴・自動（完了）遷移、サブマシン状態の再利用
 ***********************************************************************************************************/


(function (global) {
	'use strict';

	var FSM, State, Transition, Region, logger, now, emptyFunction, requestAnimationFrame, cancelAnimationFrame, uuid, klass, stateOptions, K;

	logger = function (type, message) {
		if (logger.debuggable) {
			type = type || 'log';
			message = message || '';

			switch (type) {
				case 'log':
					console.log('LOG:  ', message);
					break;
				case 'error':
					if (logger.level >= 3) {
						console.error('ERROR: ', message);
						throw new Error('ERROR:' + message);
					}
					break;
				case 'warn':
					if (logger.level >= 2) {
						console.warn('WARN: ', message);
					}
					break;
				case 'info':
					if (logger.level >= 1) {
						console.info('INFO: ', message);
					}
					break;
			}
		}
	};
	/* ログ出力しないならdebuggableをfalseにする */
	logger.level = 3;
	logger.debuggable = true;

	now = (function () {
		var polyfill = window.performance && (
			window.performance.now ||
			window.performance.webkitNow ||
			window.performance.oNow ||
			window.performance.mozNow) ||
			function () {return (new Date()).getTime();};

		return function () {
			return polyfill.call(window.performance);
		};
	}());

	emptyFunction = function () {};

	if (_.isUndefined(window.console)) {
		window.console = {
			log: emptyFunction,
			debug: emptyFunction,
			info: emptyFunction,
			warn: emptyFunction,
			error: emptyFunction
		};
	}

	requestAnimationFrame = (function () {
		return window.requestAnimationFrame ||
			window.webkitRequestAnimationFrame ||
			window.mozRequestAnimationFrame ||
			window.msRequestAnimationFrame ||
			window.oRequestAnimationFrame ||
			function (callback) {
				var currTime, timeToCall, id, lastTime;
				currTime = new Date().getTime();
				timeToCall = Math.max(0, 16 - (currTime - lastTime));
				id = window.setTimeout(function () {
					callback(currTime + timeToCall);
				}, timeToCall);
				lastTime = currTime + timeToCall;
				return id;
			};
	}());

	cancelAnimationFrame = (function () {
		return window.cancelAnimationFrame ||
			window.webkitCancelAnimationFrame ||
			window.mozCancelAnimationFrame ||
			window.msCancelAnimationFrame ||
			window.oCancelAnimationFrame ||
			function (id) {
				window.clearTimeout(id);
			};
	}());

	uuid = {};
	uuid.v4 = function () {
		function S4() {
			return (((1 + Math.random()) * 0x10000) | 0).toString(16).slice(1);
		}
		return (S4() + S4() + '-' + S4() + '-4' + S4().slice(0,3) + '-' + S4() + '-' + S4() + S4() + S4()).toLowerCase();
	};

	klass = function (Parent, props) {
		var Child, F, i;

		Child = function () {
			if (Child.uber && Child.uber.hasOwnProperty('__construct')) {
				Child.uber.__construct.apply(this, arguments);
			}
			if (Child.prototype.hasOwnProperty('__construct')) {
				Child.prototype.__construct.apply(this, arguments);
			}
		};

		Parent = Parent || Object;
		F = function () {};
		F.prototype = Parent.prototype;
		Child.prototype = new F();
		Child.uber = Parent.prototype;
		Child.prototype.constructor = Child;

		for (i in props) {
			if (props.hasOwnProperty(i)) {
				Child.prototype[i] = props[i];
			}
		}

		return Child;
	};

	K = new klass(null, {
		__construct: function (name) {
			this._id = uuid.v4();
			this._name = _.isNull(name) ? this._id : name;
			this._data = {};
		},
		getName: function () {
			return this._name;
		},
		get: function (key) {
			return this._data[key];
		},
		set: function (key, value) {
			this._data[key] = value;
			return value;
		}
	});

	FSM = new klass(K, {
		__construct: function (fsmName) {
			this._type = 'fsm';

			this._machine = new State(this._name, {_isMachine: true});
			this._region = this._machine.appendRegion();
		},

		/* パブリックメソッド */
		addState: function (state) {
			return this._region.addState(state);
		},
		addTransition: function (transition) {
			return this._region.addTransition(transition);
		},
		get: function (key) {
			return this._machine._data[key];
		},
		set: function (key, value) {
			this._machine._data[key] = value;
			return value;
		},
		isActive: function () {
			return this._machine.isActive();
		},
		/* 状態マシンの開始 */
		start: function () {
			this._machine._entryState();
		},
		/* 状態マシンの終了 */
		finish: function () {
			this._machine._exitState();
		},
		getMachine: function () {
			return this._machine;
		},

		/* プライベートメソッド */
		_findState: function (stateName, currentState) {
			var _state, i, j, l1, l2, _regions, _result;
			_state = !_.isUndefined(currentState) ? currentState : this._machine;

			if (_state._name === stateName) {
				return _state;
			} else {
				if (_state._regions.length) {
					_regions = _state._regions;
					_result = false;
					for (i = 0, l1 = _regions.length; i < l1; i += 1) {
						for (j = 0, l2 = _regions[i]._states.length; j < l2; j += 1) {
							_result = this._findState(stateName, _regions[i]._states[j]);
							if (_result) {
								return _result;
							}
						}
					}
					return _result;
				} else {
					return false;
				}
			}
		},
		_findTransition: function (transitionName, currentState) {
			var _state, i, j, k, l1, l2, l3, _regions, _result;
			_state = !_.isUndefined(currentState) ? currentState : this._machine;

			if (_state._regions.length) {
				_regions = _state._regions;
				_result = false;
				for (i = 0, l1 = _regions.length; i < l1; i += 1) {
					for (j = 0, l2 = _regions[i]._transitions.length; j < l2; j += 1) {
						if (_regions[i]._transitions[j]._name === transitionName) {
							_result = _regions[i]._transitions[j];
						}
					}
					if (!_result) {
						if (_regions[i]._states.length) {
							for (k = 0, l3 = _regions[i]._states.length; k < l3; k += 1) {
								_result = this._findTransition(transitionName, _regions[i]._states[k]);
							}
						}
					}
				}
				return _result;
			} else {
				return false;
			}
		}
	});

	stateOptions = {
		entryAction: emptyFunction,
		exitAction: emptyFunction,
		doActivity: emptyFunction,

		timer: false,
		interval: 1000,

		autoTransition: false, //完了遷移にするとtimerは使用できない

		_isMachine: false,
		_isPseudo: false,

		_isFinal: false,
		_isInitial: false,
		_isHistory: false
	};

	/* 遷移名を省略するときは、第１引数にnullを渡す */
	State = new klass(K, {
		__construct: function (stateName, options) {
			this._type = 'state';

			options = _.defaults(options || {}, _.clone(stateOptions));

			this._status = 'inactive';

			this._startTime = 0;
			this._ticks = 0;
			this._frames = 0;

			if (!_.isUndefined(options.data)) {
				_.extend(this._data, options.data);
			}

			this._entry = options.entryAction;
			this._exit = options.exitAction;
			this._do = options.doActivity;

			this._timer = options.timer;
			this._timerId = null;
			this._timerRunning = false;
			this._interval = options.interval;

			this._autoTransition = options.autoTransition;

			this._isMachine = options._isMachine;
			this._level = 0;

			this._container = null;
			this._regions = [];

			this._isFinal = options._isFinal;
			this._isInitial = options._isInitial;
			this._isHistory = options._isHistory;
			this._isPseudo = options._isPseudo;
		},

		/* パブリックメソッド */
		isActive: function () {
			return this._status === 'active';
		},
		addState: function (state) {
			if (!this._regions.length) {
				this.appendRegion(new Region());
			}
			this._regions[0].addState(state);
			
			return state;
		},
		addTransition: function (transition) {
			if (!this._regions.length) {
				this.appendRegion(new Region());
			}
			this._regions[0].addTransition(transition);
			
			return transition;
		},
		appendRegion: function (region) {
			if (region) {
				this._regions.push(region);
			} else {
				this._regions.push(region = new Region());
			}
			region._index = this._regions.length - 1;
			region._superState = this;

			region.addState(region._initialPseudo = new State(this._name + '-region-' + region._index + '-initial-pseudo', {_isInitial: true, _isPseudo: true}));
			region.addState(region._final = new State(this._name + '-region-' + region._index + '-final', {_isFinal: true}));

			return region;
		},
		addHistoryState: function (deep) {
			var _historyState;
			if (!this._regions.length) {
				this.appendRegion(new Region());
			}
			_historyState = this._regions[0].addHistoryState(deep);

			return _historyState;
		},
		completion: function () {
			var _transition;
			if (this._isMachine && _.isNull(this._container)) {
				this._exitState();
				return;
			}

			_transition = _.find(this._container._transitions, _.bind(function (t) {
				return t._sourceStateName === this._name;
			}, this));

			if (!_.isUndefined(_transition)) {
				_transition.trigger();
			} else {
				this._exitState();
				this._container.completion();
			}
		},
		getElapsedTime: function () {
			if (this._startTime) {
				return this._ticks;
			} else {
				logger('warn', 'タイマーが起動していません。');
			}
		},
		getCurrentFrames: function () {
			if (this._startTime) {
				return this._frames;
			} else {
				logger('warn', 'タイマーが起動していません。');
			}
		},

		/* プライベートメソッド */
		_getCurrentLevel: function () {
			var _currentState, _level;
			_currentState = this;
			_level = 0;
			while (!_.isNull(_currentState._container)) {
				_currentState = _currentState._container._superState;
				_level += 1;
			}
			return _level;
		},
		_findState: function (stateName) {
			var _state;
			if (this._name === stateName) {
				return this;
			} else {
				_state = null;
				_.some(this._regions, function (r) {
					_state = r._findState(stateName);
				});
				return _state;
			}
		},
		_exitState: function () {
			var _queue;
			_queue = [];

			_exitSearch(_queue, this);

			_queue.reverse();
			_.each(_queue, function (object) {
				object._inactivate();
			});
		},
		_entryState: function (explicitEntry) {
			var _state, _queue;
			_queue = [];

			if (explicitEntry) {
				_state = this._container._superState;
				_queue.push(_state);

				_.each(_state._regions, _.bind(function (r1) {
					if (!r1.isActive()) {
						_queue.push(r1);
						_queue.push(this);
						_.each(this._regions, function (r2) {
							if (!r2.isActive()) {
								_queue.push(
									r2._historyPseudo || r2._initialPseudo
								);
							}
						});
					}
				}, this));
				_.each(_queue, function (object) {
					object._activate();
				});
			} else {
				_queue.push(this);
				
				_.each(this._regions, _.bind(function (r) {
					if (!r.isActive()) {
						_queue.push(r);
						_queue.push(
							r._historyPseudo || r._initialPseudo
						);
					}
				}, this));

				_.each(_queue, function (object) {
					object._activate();
				});
			}
		},
		_activate: function () {
			var _firstTrans;

			if (!this.isActive()) {
				this._status = 'active';

				logger('info', 'State"' + this._name + '"がアクティブ化されました。');

				if (this._isPseudo) {
					if (this._isHistory) {
						if (!_.isNull(this._container._last)) {
							this._inactivate();
							this._container._last._activate();
							return;
						} else {
							this._inactivate();
							this._container._initialPseudo._activate();
							return;
						}
					}

					if (this._isInitial) {
						_firstTrans = _.find(this._container._transitions, function (t) {
							return _.isNull(t._sourceStateName);
						});
						if (!_.isUndefined(_firstTrans)) {
							_firstTrans.trigger();
						} else {
							logger('error', '初期状態への遷移が定義されていません。');
						}
					}
				} else if (this._isFinal) {
					this._inactive();
					this._container.completion();
				} else if (this._isMachine) {
					logger('info', 'Machine"' + this._name + '"が動作を開始しました。');
				} else {
					this._entry();
					if (this._timer) {
						this._setTimer();
					} else {
						this._do();
						if (this._autoTransition) {
							this.completion();
						}
					}
				}
			} else {
				logger('error', 'このState"' + this._name + '"はすでにアクティブ化されています。');
			}
		},
		_inactivate: function () {
			if (this.isActive()) {
				this._status = 'inactive';

				logger('info', 'State"' + this._name + '"が非アクティブ化されました。');

				if (!(this._isPseudo || this._isFinal || this._isMachine)) {
					if (this._timer) {
						this._clearTimer();
					}
					this._container._last = this;
					this._exit();
				} else if (this._isMachine) {
					logger('info', 'ステートマシン"' + this._name + '"が動作を終了しました。');
				}
			} else {
				logger('error', 'このState"' + this._name + '"はすでに非アクティブ化されています。');
			}
		},
		_setTimer: function () {
			var _state, _count;

			_state = this;
			_state._startTime = 0;
			_state._ticks = 0;
			_state._frames = 0;
			_state._timerRunning = true;

			_count = 1;
			_state._timerId = requestAnimationFrame(_loop);

			function _loop(timestamp) {
				if (!_state._startTime) {
					_state._startTime = timestamp ? timestamp : now();
				}

				_state._ticks = timestamp ? timestamp - _state._startTime : now() - _state._startTime;
				_state._frames += 1;

				if (_state._ticks >= _state._interval * _count) {
					_count += 1;
					_state._do();
				}
				
				if (_state._timerRunning) {
					_state._timerId = requestAnimationFrame(_loop);
				} else {
					cancelAnimationFrame(_state._timerId);
					
					_state._startTime = 0;
					_state._ticks = 0;
					_state._frames = 0;
				}
			}
		},
		_clearTimer: function () {
			this._timerRunning = false;
		}
	});

	/* 遷移名を省略するときは、第１引数にnullを渡す。addTransition()するRegionは、遷移元のStateが含まれるRegionでなければならない */
	Transition = new klass(K, {
		__construct: function (transitionName, sourceStateName, targetStateName, options) {
			this._type = 'transition';

			this._sourceStateName = sourceStateName;
			this._targetStateName = targetStateName;

			this._container = null;

			options = _.defaults(options || {}, {
				guard: null,
				effect: emptyFunction,
				internal: false
			});

			if (!_.isUndefined(options.data)) {
				this._data = _.extend(this._data, options.data);
			}

			this._guard = options.guard;
			this._effect = options.effect;
			this._internal = options.internal;
		},

		/* パブリックメソッド */
		trigger: function (memo) {
			var _sourceState, _targetState, _isExplicitEntry;
			if (_.isNull(this._container)) {
				logger('error', 'このTransition"' + this._name + '"は未登録です。');
			}
			if (!this._container.isActive()) {
				logger('error', 'このTransition"' + this._name + '"のコンテナが非アクティブです。');
			}

			if (_.isNull(this._sourceStateName)) {
				_sourceState = this._container._initialPseudo;
			} else {
				_sourceState = this._container._states[this._sourceStateName];
			}

			if (!_sourceState) {
				logger('error', '遷移元のState"' + this._sourceStateName + '"インスタンスが存在しないか未登録です。');
			}

			if (_.isNull(this._targetStateName)) {
				_targetState = this._container._final;	
			} else {
				_targetState = this._container._findState(this._targetStateName);
			}

			if (!_targetState) {
				logger('error', '遷移先のState"' + this._targetStateName + '"インスタンスが未登録です。');
			}

			/* 遷移元が終了状態であったり、遷移先の状態が何らかの擬似状態である場合、エラー出力 */
			if (_sourceState._isFinal) {
				logger('error', '遷移元を終了状態にすることはできません。');
			} else if (_targetState._isInitial) {
				logger('error', '遷移先を開始擬似状態にすることはできません。');
			}

			/* ガードが設定されていたら、ガード判定する */
			if (this._guard) {
				if (!this._guard(memo)) {
					return logger('info', 'ガードが成立しませんでした。遷移は発生しません。');
				}
			}

			if (this._internal) {
				this._effect(memo);
				return logger('info', '内部遷移を実行しました。');
			}

			logger('info', 'Transition"' + this._name + '"のトリガーが発生しました。');

			/* 遷移元状態から退場 */
			_sourceState._exitState();

			/* エフェクト発動 */
			this._effect(memo);

			/* 遷移先へ入場 */
			_isExplicitEntry = _sourceState._level < _targetState._level;
			_targetState._entryState(_isExplicitEntry);
		}
	});

	/* RegionインスタンスはStateクラスのappendRegionメソッドで追加する。 */
	Region = new klass(K, {
		__construct: function (regionName) {
			this._type = 'region';

			this._index = null;
			this._status = 'inactive';

			this._superState = null;
			this._initialPseudo = null;

			this._historyPseudo = null;
			this._final = null;
			this._last = null;

			this._states = [];
			this._transitions = [];
		},

		/* パブリックメソッド */
		isActive: function () {
			return this._status === 'active';
		},
		addState: function (state) {
			if (_.isNull(this._superState)) {
				logger('error', '追加先のRegion"' + this._name + '"が未登録です。');
			}
			if (!state instanceof State) {
				logger('error', '引数はStateのインスタンスを指定してください。');
			}

			this._states.push(state);
			this._states[state._name] = state;
			state._container = this;

			state._level = state._getCurrentLevel();
			applyToSubstates(state, function (s) {
				s._level = s._getCurrentLevel();
			});

			return state;
		},
		addTransition: function (transition) {
			if (!transition instanceof Transition) {
				logger('error', '引数はTransitionのインスタンスを指定してください。');
			}

			transition._container = this;
			this._transitions.push(transition);
			this._transitions[transition._name] = transition;

			return transition;
		},
		addHistoryState: function (deep) {
			var _historyState;

			if (_.isNull(this._superState)) {
				logger('error', '追加先のRegion"' + this._name + '"が未登録です。');
			}

			_historyState = new State(this._superState._name + '-region-' + this._index + '-history-pseudo', {_isHistory: true, _isPseudo: true});

			this._states.push(_historyState);
			this._states[_historyState._name] = _historyState;
			_historyState._container = this;
			
			this._historyPseudo = _historyState;
			_historyState._level = _historyState._getCurrentLevel();

			if (deep) {
				_.each(this.states, function (s) {
					_.each(s._regions, function (r) {
						r.addHistoryState(true);
					});
				});
			}

			return _historyState;
		},
		completion: function () {
			this._inactivate();
			if (_.every(this._superState._regions, function (region) {
				return !region.isActive();
			})) {
				this._superState.completion();
			}
		},
		findActiveState: function () {
			return _.find(this._states, function (s) {
				return s.isActive();
			});
		},

		/* プライベートメソッド */
		_findState: function (stateName) {
			var _state;
			if (_state = this._states[stateName]) {
				return _state;
			} else {
				_state = null;
				_.some(this._states, function (s) {
					_.some(s._regions, function (r) {
						_state = r._findState(stateName);
						return true;
					});
					if (!_.isNull(_state)) {
						return true;
					}
				});
				return _state;
			}
		},
		_activate: function () {
			if (this._status === 'inactive') {
				this._status = 'active';
			} else {
				logger('warn', 'このRegion"' + this._name + '"はすでにアクティブ化されています。');
			}
		},
		_inactivate: function () {
			if (this._status === 'active') {
				this._status = 'inactive';
			} else {
				logger('warn', 'このRegion"' + this._name + '"はすでに非アクティブ化されています。');
			}
		}
	});

	function _exitSearch(q, c) {
		var _result;
		q.push(c);
		_.each(c._regions, function (r) {
			if (r.isActive()) {
				q.push(r);
				_result = _.find(r._states, function (s) {
					return s.isActive();
				});
				if (!_.isUndefined(_result)) {
					_exitSearch(q, _result);
				}
			}
		});
	}

	function applyToSubstates(state, callback) {
		_.each(state._regions, function (r) {
			_.each(r._states, function (s) {
				callback(s);
				applyToSubstates(s, callback);
			});
		});
	}

	global.FSM = FSM;
	global.State = State;
	global.Transition = Transition;
	global.Region = Region;

}(this));