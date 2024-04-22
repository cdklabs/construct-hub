"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/shimmer/index.js
var require_shimmer = __commonJS({
  "node_modules/shimmer/index.js"(exports2, module2) {
    "use strict";
    function isFunction(funktion) {
      return typeof funktion === "function";
    }
    var logger = console.error.bind(console);
    function defineProperty(obj, name, value) {
      var enumerable = !!obj[name] && obj.propertyIsEnumerable(name);
      Object.defineProperty(obj, name, {
        configurable: true,
        enumerable,
        writable: true,
        value
      });
    }
    function shimmer(options) {
      if (options && options.logger) {
        if (!isFunction(options.logger))
          logger("new logger isn't a function, not replacing");
        else
          logger = options.logger;
      }
    }
    function wrap(nodule, name, wrapper) {
      if (!nodule || !nodule[name]) {
        logger("no original function " + name + " to wrap");
        return;
      }
      if (!wrapper) {
        logger("no wrapper function");
        logger(new Error().stack);
        return;
      }
      if (!isFunction(nodule[name]) || !isFunction(wrapper)) {
        logger("original object and wrapper must be functions");
        return;
      }
      var original = nodule[name];
      var wrapped = wrapper(original, name);
      defineProperty(wrapped, "__original", original);
      defineProperty(wrapped, "__unwrap", function() {
        if (nodule[name] === wrapped)
          defineProperty(nodule, name, original);
      });
      defineProperty(wrapped, "__wrapped", true);
      defineProperty(nodule, name, wrapped);
      return wrapped;
    }
    function massWrap(nodules, names, wrapper) {
      if (!nodules) {
        logger("must provide one or more modules to patch");
        logger(new Error().stack);
        return;
      } else if (!Array.isArray(nodules)) {
        nodules = [nodules];
      }
      if (!(names && Array.isArray(names))) {
        logger("must provide one or more functions to wrap on modules");
        return;
      }
      nodules.forEach(function(nodule) {
        names.forEach(function(name) {
          wrap(nodule, name, wrapper);
        });
      });
    }
    function unwrap(nodule, name) {
      if (!nodule || !nodule[name]) {
        logger("no function to unwrap.");
        logger(new Error().stack);
        return;
      }
      if (!nodule[name].__unwrap) {
        logger("no original to unwrap to -- has " + name + " already been unwrapped?");
      } else {
        return nodule[name].__unwrap();
      }
    }
    function massUnwrap(nodules, names) {
      if (!nodules) {
        logger("must provide one or more modules to patch");
        logger(new Error().stack);
        return;
      } else if (!Array.isArray(nodules)) {
        nodules = [nodules];
      }
      if (!(names && Array.isArray(names))) {
        logger("must provide one or more functions to unwrap on modules");
        return;
      }
      nodules.forEach(function(nodule) {
        names.forEach(function(name) {
          unwrap(nodule, name);
        });
      });
    }
    shimmer.wrap = wrap;
    shimmer.massWrap = massWrap;
    shimmer.unwrap = unwrap;
    shimmer.massUnwrap = massUnwrap;
    module2.exports = shimmer;
  }
});

// node_modules/emitter-listener/listener.js
var require_listener = __commonJS({
  "node_modules/emitter-listener/listener.js"(exports2, module2) {
    "use strict";
    var shimmer = require_shimmer();
    var wrap = shimmer.wrap;
    var unwrap = shimmer.unwrap;
    var SYMBOL = "wrap@before";
    function defineProperty(obj, name, value) {
      var enumerable = !!obj[name] && obj.propertyIsEnumerable(name);
      Object.defineProperty(obj, name, {
        configurable: true,
        enumerable,
        writable: true,
        value
      });
    }
    function _process(self, listeners) {
      var l = listeners.length;
      for (var p = 0; p < l; p++) {
        var listener = listeners[p];
        var before = self[SYMBOL];
        if (typeof before === "function") {
          before(listener);
        } else if (Array.isArray(before)) {
          var length = before.length;
          for (var i = 0; i < length; i++)
            before[i](listener);
        }
      }
    }
    function _listeners(self, event) {
      var listeners;
      listeners = self._events && self._events[event];
      if (!Array.isArray(listeners)) {
        if (listeners) {
          listeners = [listeners];
        } else {
          listeners = [];
        }
      }
      return listeners;
    }
    function _findAndProcess(self, event, before) {
      var after = _listeners(self, event);
      var unprocessed = after.filter(function(fn) {
        return before.indexOf(fn) === -1;
      });
      if (unprocessed.length > 0)
        _process(self, unprocessed);
    }
    function _wrap(unwrapped, visit) {
      if (!unwrapped)
        return;
      var wrapped = unwrapped;
      if (typeof unwrapped === "function") {
        wrapped = visit(unwrapped);
      } else if (Array.isArray(unwrapped)) {
        wrapped = [];
        for (var i = 0; i < unwrapped.length; i++) {
          wrapped[i] = visit(unwrapped[i]);
        }
      }
      return wrapped;
    }
    module2.exports = function wrapEmitter(emitter, onAddListener, onEmit) {
      if (!emitter || !emitter.on || !emitter.addListener || !emitter.removeListener || !emitter.emit) {
        throw new Error("can only wrap real EEs");
      }
      if (!onAddListener)
        throw new Error("must have function to run on listener addition");
      if (!onEmit)
        throw new Error("must have function to wrap listeners when emitting");
      function adding(on) {
        return function added(event, listener) {
          var existing = _listeners(this, event).slice();
          try {
            var returned = on.call(this, event, listener);
            _findAndProcess(this, event, existing);
            return returned;
          } finally {
            if (!this.on.__wrapped)
              wrap(this, "on", adding);
            if (!this.addListener.__wrapped)
              wrap(this, "addListener", adding);
          }
        };
      }
      function emitting(emit) {
        return function emitted(event) {
          if (!this._events || !this._events[event])
            return emit.apply(this, arguments);
          var unwrapped = this._events[event];
          function remover(removeListener) {
            return function removed() {
              this._events[event] = unwrapped;
              try {
                return removeListener.apply(this, arguments);
              } finally {
                unwrapped = this._events[event];
                this._events[event] = _wrap(unwrapped, onEmit);
              }
            };
          }
          wrap(this, "removeListener", remover);
          try {
            this._events[event] = _wrap(unwrapped, onEmit);
            return emit.apply(this, arguments);
          } finally {
            unwrap(this, "removeListener");
            this._events[event] = unwrapped;
          }
        };
      }
      if (!emitter[SYMBOL]) {
        defineProperty(emitter, SYMBOL, onAddListener);
      } else if (typeof emitter[SYMBOL] === "function") {
        defineProperty(emitter, SYMBOL, [emitter[SYMBOL], onAddListener]);
      } else if (Array.isArray(emitter[SYMBOL])) {
        emitter[SYMBOL].push(onAddListener);
      }
      if (!emitter.__wrapped) {
        wrap(emitter, "addListener", adding);
        wrap(emitter, "on", adding);
        wrap(emitter, "emit", emitting);
        defineProperty(emitter, "__unwrap", function() {
          unwrap(emitter, "addListener");
          unwrap(emitter, "on");
          unwrap(emitter, "emit");
          delete emitter[SYMBOL];
          delete emitter.__wrapped;
        });
        defineProperty(emitter, "__wrapped", true);
      }
    };
  }
});

// node_modules/cls-hooked/context.js
var require_context = __commonJS({
  "node_modules/cls-hooked/context.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var assert2 = require("assert");
    var wrapEmitter = require_listener();
    var async_hooks = require("async_hooks");
    var CONTEXTS_SYMBOL = "cls@contexts";
    var ERROR_SYMBOL = "error@context";
    var DEBUG_CLS_HOOKED = process.env.DEBUG_CLS_HOOKED;
    var currentUid = -1;
    module2.exports = {
      getNamespace,
      createNamespace,
      destroyNamespace,
      reset,
      ERROR_SYMBOL
    };
    function Namespace(name) {
      this.name = name;
      this.active = null;
      this._set = [];
      this.id = null;
      this._contexts = /* @__PURE__ */ new Map();
      this._indent = 0;
    }
    Namespace.prototype.set = function set(key, value) {
      if (!this.active) {
        throw new Error("No context available. ns.run() or ns.bind() must be called first.");
      }
      this.active[key] = value;
      if (DEBUG_CLS_HOOKED) {
        const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
        debug2(indentStr + "CONTEXT-SET KEY:" + key + "=" + value + " in ns:" + this.name + " currentUid:" + currentUid + " active:" + util.inspect(this.active, { showHidden: true, depth: 2, colors: true }));
      }
      return value;
    };
    Namespace.prototype.get = function get(key) {
      if (!this.active) {
        if (DEBUG_CLS_HOOKED) {
          const asyncHooksCurrentId = async_hooks.currentId();
          const triggerId = async_hooks.triggerAsyncId();
          const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
          debug2(`${indentStr}CONTEXT-GETTING KEY NO ACTIVE NS: (${this.name}) ${key}=undefined currentUid:${currentUid} asyncHooksCurrentId:${asyncHooksCurrentId} triggerId:${triggerId} len:${this._set.length}`);
        }
        return void 0;
      }
      if (DEBUG_CLS_HOOKED) {
        const asyncHooksCurrentId = async_hooks.executionAsyncId();
        const triggerId = async_hooks.triggerAsyncId();
        const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
        debug2(indentStr + "CONTEXT-GETTING KEY:" + key + "=" + this.active[key] + " (" + this.name + ") currentUid:" + currentUid + " active:" + util.inspect(this.active, { showHidden: true, depth: 2, colors: true }));
        debug2(`${indentStr}CONTEXT-GETTING KEY: (${this.name}) ${key}=${this.active[key]} currentUid:${currentUid} asyncHooksCurrentId:${asyncHooksCurrentId} triggerId:${triggerId} len:${this._set.length} active:${util.inspect(this.active)}`);
      }
      return this.active[key];
    };
    Namespace.prototype.createContext = function createContext() {
      let context = Object.create(this.active ? this.active : Object.prototype);
      context._ns_name = this.name;
      context.id = currentUid;
      if (DEBUG_CLS_HOOKED) {
        const asyncHooksCurrentId = async_hooks.executionAsyncId();
        const triggerId = async_hooks.triggerAsyncId();
        const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
        debug2(`${indentStr}CONTEXT-CREATED Context: (${this.name}) currentUid:${currentUid} asyncHooksCurrentId:${asyncHooksCurrentId} triggerId:${triggerId} len:${this._set.length} context:${util.inspect(context, { showHidden: true, depth: 2, colors: true })}`);
      }
      return context;
    };
    Namespace.prototype.run = function run(fn) {
      let context = this.createContext();
      this.enter(context);
      try {
        if (DEBUG_CLS_HOOKED) {
          const triggerId = async_hooks.triggerAsyncId();
          const asyncHooksCurrentId = async_hooks.executionAsyncId();
          const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
          debug2(`${indentStr}CONTEXT-RUN BEGIN: (${this.name}) currentUid:${currentUid} triggerId:${triggerId} asyncHooksCurrentId:${asyncHooksCurrentId} len:${this._set.length} context:${util.inspect(context)}`);
        }
        fn(context);
        return context;
      } catch (exception) {
        if (exception) {
          exception[ERROR_SYMBOL] = context;
        }
        throw exception;
      } finally {
        if (DEBUG_CLS_HOOKED) {
          const triggerId = async_hooks.triggerAsyncId();
          const asyncHooksCurrentId = async_hooks.executionAsyncId();
          const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
          debug2(`${indentStr}CONTEXT-RUN END: (${this.name}) currentUid:${currentUid} triggerId:${triggerId} asyncHooksCurrentId:${asyncHooksCurrentId} len:${this._set.length} ${util.inspect(context)}`);
        }
        this.exit(context);
      }
    };
    Namespace.prototype.runAndReturn = function runAndReturn(fn) {
      let value;
      this.run(function(context) {
        value = fn(context);
      });
      return value;
    };
    Namespace.prototype.runPromise = function runPromise(fn) {
      let context = this.createContext();
      this.enter(context);
      let promise = fn(context);
      if (!promise || !promise.then || !promise.catch) {
        throw new Error("fn must return a promise.");
      }
      if (DEBUG_CLS_HOOKED) {
        debug2("CONTEXT-runPromise BEFORE: (" + this.name + ") currentUid:" + currentUid + " len:" + this._set.length + " " + util.inspect(context));
      }
      return promise.then((result) => {
        if (DEBUG_CLS_HOOKED) {
          debug2("CONTEXT-runPromise AFTER then: (" + this.name + ") currentUid:" + currentUid + " len:" + this._set.length + " " + util.inspect(context));
        }
        this.exit(context);
        return result;
      }).catch((err) => {
        err[ERROR_SYMBOL] = context;
        if (DEBUG_CLS_HOOKED) {
          debug2("CONTEXT-runPromise AFTER catch: (" + this.name + ") currentUid:" + currentUid + " len:" + this._set.length + " " + util.inspect(context));
        }
        this.exit(context);
        throw err;
      });
    };
    Namespace.prototype.bind = function bindFactory(fn, context) {
      if (!context) {
        if (!this.active) {
          context = this.createContext();
        } else {
          context = this.active;
        }
      }
      let self = this;
      return function clsBind() {
        self.enter(context);
        try {
          return fn.apply(this, arguments);
        } catch (exception) {
          if (exception) {
            exception[ERROR_SYMBOL] = context;
          }
          throw exception;
        } finally {
          self.exit(context);
        }
      };
    };
    Namespace.prototype.enter = function enter(context) {
      assert2.ok(context, "context must be provided for entering");
      if (DEBUG_CLS_HOOKED) {
        const asyncHooksCurrentId = async_hooks.executionAsyncId();
        const triggerId = async_hooks.triggerAsyncId();
        const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
        debug2(`${indentStr}CONTEXT-ENTER: (${this.name}) currentUid:${currentUid} triggerId:${triggerId} asyncHooksCurrentId:${asyncHooksCurrentId} len:${this._set.length} ${util.inspect(context)}`);
      }
      this._set.push(this.active);
      this.active = context;
    };
    Namespace.prototype.exit = function exit(context) {
      assert2.ok(context, "context must be provided for exiting");
      if (DEBUG_CLS_HOOKED) {
        const asyncHooksCurrentId = async_hooks.executionAsyncId();
        const triggerId = async_hooks.triggerAsyncId();
        const indentStr = " ".repeat(this._indent < 0 ? 0 : this._indent);
        debug2(`${indentStr}CONTEXT-EXIT: (${this.name}) currentUid:${currentUid} triggerId:${triggerId} asyncHooksCurrentId:${asyncHooksCurrentId} len:${this._set.length} ${util.inspect(context)}`);
      }
      if (this.active === context) {
        assert2.ok(this._set.length, "can't remove top context");
        this.active = this._set.pop();
        return;
      }
      let index = this._set.lastIndexOf(context);
      if (index < 0) {
        if (DEBUG_CLS_HOOKED) {
          debug2("??ERROR?? context exiting but not entered - ignoring: " + util.inspect(context));
        }
        assert2.ok(index >= 0, "context not currently entered; can't exit. \n" + util.inspect(this) + "\n" + util.inspect(context));
      } else {
        assert2.ok(index, "can't remove top context");
        this._set.splice(index, 1);
      }
    };
    Namespace.prototype.bindEmitter = function bindEmitter(emitter) {
      assert2.ok(emitter.on && emitter.addListener && emitter.emit, "can only bind real EEs");
      let namespace = this;
      let thisSymbol = "context@" + this.name;
      function attach(listener) {
        if (!listener) {
          return;
        }
        if (!listener[CONTEXTS_SYMBOL]) {
          listener[CONTEXTS_SYMBOL] = /* @__PURE__ */ Object.create(null);
        }
        listener[CONTEXTS_SYMBOL][thisSymbol] = {
          namespace,
          context: namespace.active
        };
      }
      function bind(unwrapped) {
        if (!(unwrapped && unwrapped[CONTEXTS_SYMBOL])) {
          return unwrapped;
        }
        let wrapped = unwrapped;
        let unwrappedContexts = unwrapped[CONTEXTS_SYMBOL];
        Object.keys(unwrappedContexts).forEach(function(name) {
          let thunk = unwrappedContexts[name];
          wrapped = thunk.namespace.bind(wrapped, thunk.context);
        });
        return wrapped;
      }
      wrapEmitter(emitter, attach, bind);
    };
    Namespace.prototype.fromException = function fromException(exception) {
      return exception[ERROR_SYMBOL];
    };
    function getNamespace(name) {
      return process.namespaces[name];
    }
    function createNamespace(name) {
      assert2.ok(name, "namespace must be given a name.");
      if (DEBUG_CLS_HOOKED) {
        debug2(`NS-CREATING NAMESPACE (${name})`);
      }
      let namespace = new Namespace(name);
      namespace.id = currentUid;
      const hook = async_hooks.createHook({
        init(asyncId, type, triggerId, resource) {
          currentUid = async_hooks.executionAsyncId();
          if (namespace.active) {
            namespace._contexts.set(asyncId, namespace.active);
            if (DEBUG_CLS_HOOKED) {
              const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
              debug2(`${indentStr}INIT [${type}] (${name}) asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} resource:${resource}`);
            }
          } else if (currentUid === 0) {
            const triggerId2 = async_hooks.triggerAsyncId();
            const triggerIdContext = namespace._contexts.get(triggerId2);
            if (triggerIdContext) {
              namespace._contexts.set(asyncId, triggerIdContext);
              if (DEBUG_CLS_HOOKED) {
                const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
                debug2(`${indentStr}INIT USING CONTEXT FROM TRIGGERID [${type}] (${name}) asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId2} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} resource:${resource}`);
              }
            } else if (DEBUG_CLS_HOOKED) {
              const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
              debug2(`${indentStr}INIT MISSING CONTEXT [${type}] (${name}) asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId2} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} resource:${resource}`);
            }
          }
          if (DEBUG_CLS_HOOKED && type === "PROMISE") {
            debug2(util.inspect(resource, { showHidden: true }));
            const parentId = resource.parentId;
            const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
            debug2(`${indentStr}INIT RESOURCE-PROMISE [${type}] (${name}) parentId:${parentId} asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} resource:${resource}`);
          }
        },
        before(asyncId) {
          currentUid = async_hooks.executionAsyncId();
          let context;
          context = namespace._contexts.get(asyncId) || namespace._contexts.get(currentUid);
          if (context) {
            if (DEBUG_CLS_HOOKED) {
              const triggerId = async_hooks.triggerAsyncId();
              const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
              debug2(`${indentStr}BEFORE (${name}) asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} context:${util.inspect(context)}`);
              namespace._indent += 2;
            }
            namespace.enter(context);
          } else if (DEBUG_CLS_HOOKED) {
            const triggerId = async_hooks.triggerAsyncId();
            const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
            debug2(`${indentStr}BEFORE MISSING CONTEXT (${name}) asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} namespace._contexts:${util.inspect(namespace._contexts, { showHidden: true, depth: 2, colors: true })}`);
            namespace._indent += 2;
          }
        },
        after(asyncId) {
          currentUid = async_hooks.executionAsyncId();
          let context;
          context = namespace._contexts.get(asyncId) || namespace._contexts.get(currentUid);
          if (context) {
            if (DEBUG_CLS_HOOKED) {
              const triggerId = async_hooks.triggerAsyncId();
              namespace._indent -= 2;
              const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
              debug2(`${indentStr}AFTER (${name}) asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} context:${util.inspect(context)}`);
            }
            namespace.exit(context);
          } else if (DEBUG_CLS_HOOKED) {
            const triggerId = async_hooks.triggerAsyncId();
            namespace._indent -= 2;
            const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
            debug2(`${indentStr}AFTER MISSING CONTEXT (${name}) asyncId:${asyncId} currentUid:${currentUid} triggerId:${triggerId} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} context:${util.inspect(context)}`);
          }
        },
        destroy(asyncId) {
          currentUid = async_hooks.executionAsyncId();
          if (DEBUG_CLS_HOOKED) {
            const triggerId = async_hooks.triggerAsyncId();
            const indentStr = " ".repeat(namespace._indent < 0 ? 0 : namespace._indent);
            debug2(`${indentStr}DESTROY (${name}) currentUid:${currentUid} asyncId:${asyncId} triggerId:${triggerId} active:${util.inspect(namespace.active, { showHidden: true, depth: 2, colors: true })} context:${util.inspect(namespace._contexts.get(currentUid))}`);
          }
          namespace._contexts.delete(asyncId);
        }
      });
      hook.enable();
      process.namespaces[name] = namespace;
      return namespace;
    }
    function destroyNamespace(name) {
      let namespace = getNamespace(name);
      assert2.ok(namespace, `can't delete nonexistent namespace! "` + name + '"');
      assert2.ok(namespace.id, "don't assign to process.namespaces directly! " + util.inspect(namespace));
      process.namespaces[name] = null;
    }
    function reset() {
      if (process.namespaces) {
        Object.keys(process.namespaces).forEach(function(name) {
          destroyNamespace(name);
        });
      }
      process.namespaces = /* @__PURE__ */ Object.create(null);
    }
    process.namespaces = {};
    function debug2(...args) {
      if (DEBUG_CLS_HOOKED) {
        process._rawDebug(`${util.format(...args)}`);
      }
    }
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/logger.js
var require_logger = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/logger.js"(exports2, module2) {
    "use strict";
    var validLogLevels = ["debug", "info", "warn", "error", "silent"];
    var defaultLogLevel = validLogLevels.indexOf("error");
    var logLevel = calculateLogLevel(process.env.AWS_XRAY_DEBUG_MODE ? "debug" : process.env.AWS_XRAY_LOG_LEVEL);
    var logger = {
      error: createLoggerForLevel("error"),
      info: createLoggerForLevel("info"),
      warn: createLoggerForLevel("warn"),
      debug: createLoggerForLevel("debug")
    };
    function createLoggerForLevel(level) {
      var loggerLevel = validLogLevels.indexOf(level);
      var consoleMethod = console[level] || console.log || (() => {
      });
      if (loggerLevel >= logLevel) {
        return (message, meta) => {
          if (message || meta) {
            consoleMethod(formatLogMessage(level, message, meta));
          }
        };
      } else {
        return () => {
        };
      }
    }
    function calculateLogLevel(level) {
      if (level) {
        var normalisedLevel = level.toLowerCase();
        var index = validLogLevels.indexOf(normalisedLevel);
        return index >= 0 ? index : defaultLogLevel;
      }
      return defaultLogLevel;
    }
    function createTimestamp(date) {
      var tzo = -date.getTimezoneOffset(), dif = tzo >= 0 ? "+" : "-", pad = function(num) {
        var norm = Math.floor(Math.abs(num));
        return (norm < 10 ? "0" : "") + norm;
      };
      return new Date(date.getTime() + tzo * 60 * 1e3).toISOString().replace(/T/, " ").replace(/Z/, " ") + dif + pad(tzo / 60) + ":" + pad(tzo % 60);
    }
    function isLambdaFunction() {
      return process.env.LAMBDA_TASK_ROOT !== void 0;
    }
    function formatLogMessage(level, message, meta) {
      var messageParts = [];
      if (!isLambdaFunction()) {
        messageParts.push(createTimestamp(/* @__PURE__ */ new Date()));
        messageParts.push(`[${level.toUpperCase()}]`);
      }
      if (message) {
        messageParts.push(message);
      }
      var logString = messageParts.join(" ");
      var metaDataString = formatMetaData(meta);
      return [logString, metaDataString].filter((str) => str.length > 0).join("\n  ");
    }
    function formatMetaData(meta) {
      if (!meta) {
        return "";
      }
      return typeof meta === "string" ? meta : JSON.stringify(meta);
    }
    var logging = {
      setLogger: function setLogger(logObj) {
        logger = logObj;
      },
      getLogger: function getLogger() {
        return logger;
      }
    };
    module2.exports = logging;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/captured_exception.js
var require_captured_exception = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/captured_exception.js"(exports2, module2) {
    "use strict";
    var crypto = require("crypto");
    function CapturedException(err, remote) {
      this.init(err, remote);
    }
    CapturedException.prototype.init = function init(err, remote) {
      var e = typeof err === "string" || err instanceof String ? { message: err, name: "" } : err;
      this.message = e.message;
      this.type = e.name;
      this.stack = [];
      this.remote = !!remote;
      this.id = crypto.randomBytes(8).toString("hex");
      if (e.stack) {
        var stack = e.stack.split("\n");
        stack.shift();
        stack.forEach((stackline) => {
          var line = stackline.trim().replace(/\(|\)/g, "");
          line = line.substring(line.indexOf(" ") + 1);
          var label = line.lastIndexOf(" ") >= 0 ? line.slice(0, line.lastIndexOf(" ")) : null;
          var path = Array.isArray(label) && !label.length ? line : line.slice(line.lastIndexOf(" ") + 1);
          path = path.split(":");
          var entry = {
            path: path[0],
            line: parseInt(path[1]),
            label: label || "anonymous"
          };
          this.stack.push(entry);
        }, this);
      }
    };
    module2.exports = CapturedException;
  }
});

// node_modules/atomic-batcher/index.js
var require_atomic_batcher = __commonJS({
  "node_modules/atomic-batcher/index.js"(exports2, module2) {
    "use strict";
    module2.exports = batcher;
    function batcher(run) {
      var running = false;
      var pendingBatch = null;
      var pendingCallbacks = null;
      var callbacks = null;
      return append;
      function done(err) {
        if (callbacks)
          callAll(callbacks, err);
        running = false;
        callbacks = pendingCallbacks;
        var nextBatch = pendingBatch;
        pendingBatch = null;
        pendingCallbacks = null;
        if (!nextBatch || !nextBatch.length) {
          if (!callbacks || !callbacks.length) {
            callbacks = null;
            return;
          }
          if (!nextBatch)
            nextBatch = [];
        }
        running = true;
        run(nextBatch, done);
      }
      function append(val, cb) {
        if (running) {
          if (!pendingBatch) {
            pendingBatch = [];
            pendingCallbacks = [];
          }
          pushAll(pendingBatch, val);
          if (cb)
            pendingCallbacks.push(cb);
        } else {
          if (cb)
            callbacks = [cb];
          running = true;
          run(Array.isArray(val) ? val : [val], done);
        }
      }
    }
    function pushAll(list, val) {
      if (Array.isArray(val))
        pushArray(list, val);
      else
        list.push(val);
    }
    function pushArray(list, val) {
      for (var i = 0; i < val.length; i++)
        list.push(val[i]);
    }
    function callAll(list, err) {
      for (var i = 0; i < list.length; i++)
        list[i](err);
    }
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/daemon_config.js
var require_daemon_config = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/daemon_config.js"(exports2, module2) {
    "use strict";
    var logger = require_logger();
    var DaemonConfig = {
      udp_ip: "127.0.0.1",
      udp_port: 2e3,
      tcp_ip: "127.0.0.1",
      tcp_port: 2e3,
      setDaemonAddress: function setDaemonAddress(address) {
        if (!process.env.AWS_XRAY_DAEMON_ADDRESS) {
          processAddress(address);
          logger.getLogger().info("Configured daemon address to " + address + ".");
        } else {
          logger.getLogger().warn("Ignoring call to setDaemonAddress as AWS_XRAY_DAEMON_ADDRESS is set. The current daemon address will not be changed.");
        }
      }
    };
    var processAddress = function processAddress2(address) {
      if (address.indexOf(":") === -1) {
        throw new Error("Invalid Daemon Address. You must specify an ip and port.");
      } else {
        var splitAddress = address.split(" ");
        if (splitAddress.length === 1) {
          if (address.indexOf("udp") > -1 || address.indexOf("tcp") > -1) {
            throw new Error("Invalid Daemon Address. You must specify both tcp and udp addresses.");
          }
          var addr = address.split(":");
          if (!addr[0]) {
            throw new Error("Invalid Daemon Address. You must specify an ip.");
          }
          DaemonConfig.udp_ip = addr[0];
          DaemonConfig.tcp_ip = addr[0];
          DaemonConfig.udp_port = addr[1];
          DaemonConfig.tcp_port = addr[1];
        } else if (splitAddress.length === 2) {
          var part_1 = splitAddress[0].split(":");
          var part_2 = splitAddress[1].split(":");
          var addr_map = {};
          addr_map[part_1[0]] = part_1;
          addr_map[part_2[0]] = part_2;
          DaemonConfig.udp_ip = addr_map["udp"][1];
          DaemonConfig.udp_port = parseInt(addr_map["udp"][2]);
          DaemonConfig.tcp_ip = addr_map["tcp"][1];
          DaemonConfig.tcp_port = parseInt(addr_map["tcp"][2]);
          if (!DaemonConfig.udp_port || !DaemonConfig.tcp_port) {
            throw new Error("Invalid Daemon Address. You must specify port number.");
          }
        }
      }
    };
    if (process.env.AWS_XRAY_DAEMON_ADDRESS) {
      processAddress(process.env.AWS_XRAY_DAEMON_ADDRESS);
    }
    module2.exports = DaemonConfig;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segment_emitter.js
var require_segment_emitter = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segment_emitter.js"(exports2, module2) {
    "use strict";
    var dgram = require("dgram");
    var batcher = require_atomic_batcher();
    var logger = require_logger();
    var PROTOCOL_HEADER = '{"format":"json","version":1}';
    var PROTOCOL_DELIMITER = "\n";
    function batchSendData(ops, callback) {
      var client = dgram.createSocket("udp4");
      executeSendData(client, ops, 0, function() {
        try {
          client.close();
        } finally {
          callback();
        }
      });
    }
    function executeSendData(client, ops, index, callback) {
      if (index >= ops.length) {
        callback();
        return;
      }
      sendMessage(client, ops[index], function() {
        executeSendData(client, ops, index + 1, callback);
      });
    }
    function sendMessage(client, data, batchCallback) {
      var msg = data.msg;
      var offset = data.offset;
      var length = data.length;
      var port = data.port;
      var address = data.address;
      var callback = data.callback;
      client.send(msg, offset, length, port, address, function(err) {
        try {
          callback(err);
        } finally {
          batchCallback();
        }
      });
    }
    function BatchingTemporarySocket() {
      this.batchSend = batcher(batchSendData);
    }
    BatchingTemporarySocket.prototype.send = function(msg, offset, length, port, address, callback) {
      var work = {
        msg,
        offset,
        length,
        port,
        address,
        callback
      };
      this.batchSend(work);
    };
    var SegmentEmitter = {
      daemonConfig: require_daemon_config(),
      /**
       * Returns the formatted segment JSON string.
       * @param {Segment} segment - The segment to format.
       */
      format: function format(segment) {
        return PROTOCOL_HEADER + PROTOCOL_DELIMITER + segment.toString();
      },
      /**
       * Creates a UDP socket connection and send the formatted segment.
       * @param {Segment} segment - The segment to send to the daemon.
       */
      send: function send(segment) {
        if (!this.socket) {
          if (this.useBatchingTemporarySocket) {
            this.socket = new BatchingTemporarySocket();
          } else {
            this.socket = dgram.createSocket("udp4").unref();
          }
        }
        var client = this.socket;
        var formatted = segment.format();
        var data = PROTOCOL_HEADER + PROTOCOL_DELIMITER + formatted;
        var message = Buffer.from(data);
        var short = '{"trace_id:"' + segment.trace_id + '","id":"' + segment.id + '"}';
        var type = segment.type === "subsegment" ? "Subsegment" : "Segment";
        client.send(message, 0, message.length, this.daemonConfig.udp_port, this.daemonConfig.udp_ip, function(err) {
          if (err) {
            if (err.code === "EMSGSIZE") {
              logger.getLogger().error(type + " too large to send: " + short + " (" + message.length + " bytes).");
            } else {
              logger.getLogger().error("Error occured sending segment: ", err);
            }
          } else {
            logger.getLogger().debug(type + ' sent: {"trace_id:"' + segment.trace_id + '","id":"' + segment.id + '"}');
            logger.getLogger().debug("UDP message sent: " + segment);
          }
        });
      },
      /**
       * Configures the address and/or port the daemon is expected to be on.
       * @param {string} address - Address of the daemon the segments should be sent to. Should be formatted as an IPv4 address.
       * @module SegmentEmitter
       * @function setDaemonAddress
       */
      setDaemonAddress: function setDaemonAddress(address) {
        this.daemonConfig.setDaemonAddress(address);
      },
      /**
       * Get the UDP IP the emitter is configured to.
       * @module SegmentEmitter
       * @function getIp
       */
      getIp: function getIp() {
        return this.daemonConfig.udp_ip;
      },
      /**
       * Get the UDP port the emitter is configured to.
       * @module SegmentEmitter
       * @function getPort
       */
      getPort: function getPort() {
        return this.daemonConfig.udp_port;
      },
      /**
       * Forces the segment emitter to create a new socket on send, and close it on complete.
       * @module SegmentEmitter
       * @function disableReusableSocket
       */
      disableReusableSocket: function() {
        this.useBatchingTemporarySocket = true;
      }
    };
    module2.exports = SegmentEmitter;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/trace_id.js
var require_trace_id = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/trace_id.js"(exports2, module2) {
    "use strict";
    var crypto = require("crypto");
    var logger = require_logger();
    var TraceID = class _TraceID {
      /**
       * Constructs a new trace ID using the current time.
       * @param {string} [tsHex] - time stamp to use for trace ID in hexadecimal format
       * @param {string} [numberhex] - string of hexadecimal characters for random portion of Trace ID
       * @constructor
       */
      constructor(tsHex, numberhex) {
        this.version = 1;
        this.timestamp = tsHex || Math.round((/* @__PURE__ */ new Date()).getTime() / 1e3).toString(16);
        this.id = numberhex || crypto.randomBytes(12).toString("hex");
      }
      /**
       * @returns {TraceID} - a hardcoded trace ID using zeroed timestamp and random ID
       */
      static Invalid() {
        return new _TraceID("00000000", "000000000000000000000000");
      }
      /**
       * Constructs a new trace ID from provided string. If no string is provided or the provided string is invalid,
       * log an error but a new trace ID still returned. This can be used as a trace ID string validator.
       * @param {string} [rawID] - string to create a Trace ID object from.
       */
      static FromString(rawID) {
        const DELIMITER = "-";
        var traceID = new _TraceID();
        var version, timestamp;
        if (!rawID || typeof rawID !== "string") {
          logger.getLogger().error("Empty or non-string trace ID provided");
          return traceID;
        }
        const parts = rawID.trim().split(DELIMITER);
        if (parts.length !== 3) {
          logger.getLogger().error("Unrecognized trace ID format");
          return traceID;
        }
        version = parseInt(parts[0]);
        if (isNaN(version) || version < 1) {
          logger.getLogger().error("Trace ID version must be positive integer");
          return traceID;
        }
        timestamp = parseInt(parts[1], 16).toString(16);
        if (timestamp === "NaN") {
          logger.getLogger().error("Trace ID timestamp must be a hex-encoded value");
          return traceID;
        }
        traceID.version = version;
        traceID.timestamp = timestamp;
        traceID.id = parts[2];
        return traceID;
      }
      /**
       * Returns a string representation of the trace ID.
       * @returns {string} - stringified trace ID, e.g. 1-57fbe041-2c7ad569f5d6ff149137be86
       */
      toString() {
        return `${this.version.toString()}-${this.timestamp}-${this.id}`;
      }
    };
    module2.exports = TraceID;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/utils.js
var require_utils = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/utils.js"(exports2, module2) {
    "use strict";
    var crypto = require("crypto");
    var logger = require_logger();
    var TraceID = require_trace_id();
    var utils = {
      /**
       * Checks a HTTP response code, where 4xx are 'error' and 5xx are 'fault'.
       * @param {string} status - the HTTP response status code.
       * @returns [string] - 'error', 'fault' or nothing on no match
       * @alias module:utils.getCauseTypeFromHttpStatus
       */
      getCauseTypeFromHttpStatus: function getCauseTypeFromHttpStatus(status) {
        var stat = status.toString();
        if (stat.match(/^[4][0-9]{2}$/) !== null) {
          return "error";
        } else if (stat.match(/^[5][0-9]{2}$/) !== null) {
          return "fault";
        }
      },
      /**
       * Removes the query string parameters from a given http request path
       * as it may contain sensitive information
       *
       * Related issue: https://github.com/aws/aws-xray-sdk-node/issues/246
       *
       * Node documentation: https://nodejs.org/api/http.html#http_http_request_url_options_callback
       *
       * @param {string} path - options.path in a http.request callback
       * @returns [string] - removes query string element from path
       * @alias module:utils.stripQueryStringFromPath
       */
      stripQueryStringFromPath: function stripQueryStringFromPath(path) {
        return path ? path.split("?")[0] : "";
      },
      /**
       * Performs a case-insensitive wildcard match against two strings. This method works with pseduo-regex chars; specifically ? and * are supported.
       *   An asterisk (*) represents any combination of characters
       *   A question mark (?) represents any single character
       *
       * @param {string} pattern - the regex-like pattern to be compared against.
       * @param {string} text - the string to compare against the pattern.
       * @returns boolean
       * @alias module:utils.wildcardMatch
       */
      wildcardMatch: function wildcardMatch(pattern, text) {
        if (pattern === void 0 || text === void 0) {
          return false;
        }
        if (pattern.length === 1 && pattern.charAt(0) === "*") {
          return true;
        }
        var patternLength = pattern.length;
        var textLength = text.length;
        var indexOfGlob = pattern.indexOf("*");
        pattern = pattern.toLowerCase();
        text = text.toLowerCase();
        if (indexOfGlob === -1 || indexOfGlob === patternLength - 1) {
          var match = function simpleWildcardMatch() {
            var j2 = 0;
            for (var i2 = 0; i2 < patternLength; i2++) {
              var patternChar2 = pattern.charAt(i2);
              if (patternChar2 === "*") {
                return true;
              } else if (patternChar2 === "?") {
                if (j2 === textLength) {
                  return false;
                }
                j2++;
              } else {
                if (j2 >= textLength || patternChar2 != text.charAt(j2)) {
                  return false;
                }
                j2++;
              }
            }
            return j2 === textLength;
          };
          return match();
        }
        var matchArray = [];
        matchArray[0] = true;
        for (var j = 0; j < patternLength; j++) {
          var i;
          var patternChar = pattern.charAt(j);
          if (patternChar != "*") {
            for (i = textLength - 1; i >= 0; i--) {
              matchArray[i + 1] = !!matchArray[i] && (patternChar === "?" || patternChar === text.charAt(i));
            }
          } else {
            i = 0;
            while (i <= textLength && !matchArray[i]) {
              i++;
            }
            for (i; i <= textLength; i++) {
              matchArray[i] = true;
            }
          }
          matchArray[0] = matchArray[0] && patternChar === "*";
        }
        return matchArray[textLength];
      },
      LambdaUtils: {
        validTraceData: function(xAmznTraceId) {
          var valid = false;
          if (xAmznTraceId) {
            var data = utils.processTraceData(xAmznTraceId);
            valid = !!(data && data.root && data.parent && data.sampled);
          }
          return valid;
        },
        /**
         * Populates trace ID, parent ID, and sampled decision of given segment. Will always populate valid values,
         * even if xAmznTraceId contains missing or invalid values. This ensures downstream services receive valid
         * headers.
         * @param {Segment} segment - Facade segment to be populated
         * @param {String} xAmznTraceId - Raw Trace Header to supply trace data
         * @returns {Boolean} - true if required fields are present and Trace ID is valid, false otherwise
         */
        populateTraceData: function(segment, xAmznTraceId) {
          logger.getLogger().debug("Lambda trace data found: " + xAmznTraceId);
          let traceData = utils.processTraceData(xAmznTraceId);
          var valid = false;
          if (!traceData) {
            traceData = {};
            logger.getLogger().error("_X_AMZN_TRACE_ID is empty or has an invalid format");
          } else if (!traceData.root || !traceData.parent || !traceData.sampled) {
            logger.getLogger().error("_X_AMZN_TRACE_ID is missing required information");
          } else {
            valid = true;
          }
          segment.trace_id = TraceID.FromString(traceData.root).toString();
          segment.id = traceData.parent || crypto.randomBytes(8).toString("hex");
          if (traceData.root && segment.trace_id !== traceData.root) {
            logger.getLogger().error("_X_AMZN_TRACE_ID contains invalid trace ID");
            valid = false;
          }
          if (!parseInt(traceData.sampled)) {
            segment.notTraced = true;
          } else {
            delete segment.notTraced;
          }
          if (traceData.data) {
            segment.additionalTraceData = traceData.data;
          }
          logger.getLogger().debug("Segment started: " + JSON.stringify(traceData));
          return valid;
        }
      },
      /**
       * Splits out the data from the trace id format.  Used by the middleware.
       * @param {String} traceData - The additional trace data (typically in req.headers.x-amzn-trace-id).
       * @returns {object}
       * @alias module:mw_utils.processTraceData
       */
      processTraceData: function processTraceData(traceData) {
        var amznTraceData = {};
        var data = {};
        var reservedKeywords = ["root", "parent", "sampled", "self"];
        var remainingBytes = 256;
        if (!(typeof traceData === "string" && traceData)) {
          return amznTraceData;
        }
        traceData.split(";").forEach(function(header) {
          if (!header) {
            return;
          }
          var pair = header.split("=");
          if (pair[0] && pair[1]) {
            let key = pair[0].trim();
            let value = pair[1].trim();
            let lowerCaseKey = key.toLowerCase();
            let reserved = reservedKeywords.indexOf(lowerCaseKey) !== -1;
            if (reserved) {
              amznTraceData[lowerCaseKey] = value;
            } else if (!reserved && remainingBytes - (lowerCaseKey.length + value.length) >= 0) {
              data[key] = value;
              remainingBytes -= key.length + value.length;
            }
          }
        });
        amznTraceData["data"] = data;
        return amznTraceData;
      },
      /**
       * Makes a shallow copy of an object without given keys - keeps prototype
       * @param {Object} obj - The object to copy
       * @param {string[]} [keys=[]] - The keys that won't be copied
       * @param {boolean} [preservePrototype=false] - If true also copy prototype properties
       * @returns {}
       */
      objectWithoutProperties: function objectWithoutProperties(obj, keys, preservePrototype) {
        keys = Array.isArray(keys) ? keys : [];
        preservePrototype = typeof preservePrototype === "boolean" ? preservePrototype : false;
        var target = preservePrototype ? Object.create(Object.getPrototypeOf(obj)) : {};
        for (var property in obj) {
          if (keys.indexOf(property) >= 0) {
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(obj, property)) {
            continue;
          }
          target[property] = obj[property];
        }
        return target;
      },
      /**
       * Safely gets an integer from a string or number
       * @param {String | Number} - input to cast to integer
       * @returns {Number} - Integer representation of input, or 0 if input is not castable to int
       */
      safeParseInt: (val) => {
        if (!val || isNaN(val)) {
          return 0;
        }
        return parseInt(val);
      }
    };
    module2.exports = utils;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/segment_utils.js
var require_segment_utils = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/segment_utils.js"(exports2, module2) {
    "use strict";
    var { safeParseInt } = require_utils();
    var logger = require_logger();
    var DEFAULT_STREAMING_THRESHOLD = 100;
    var utils = {
      streamingThreshold: DEFAULT_STREAMING_THRESHOLD,
      getCurrentTime: function getCurrentTime() {
        return Date.now() / 1e3;
      },
      setOrigin: function setOrigin(origin) {
        this.origin = origin;
      },
      setPluginData: function setPluginData(pluginData) {
        this.pluginData = pluginData;
      },
      setSDKData: function setSDKData(sdkData) {
        this.sdkData = sdkData;
      },
      setServiceData: function setServiceData(serviceData) {
        this.serviceData = serviceData;
      },
      /**
       * Overrides the default streaming threshold (100).
       * The threshold represents the maximum number of subsegments on a single segment before
       * the SDK beings to send the completed subsegments out of band of the main segment.
       * Reduce this threshold if you see the 'Segment too large to send' error.
       * @param {number} threshold - The new threshold to use.
       * @memberof AWSXRay
       */
      setStreamingThreshold: function setStreamingThreshold(threshold) {
        if (isFinite(threshold) && threshold >= 0) {
          utils.streamingThreshold = threshold;
          logger.getLogger().debug("Subsegment streaming threshold set to: " + threshold);
        } else {
          logger.getLogger().error("Invalid threshold: " + threshold + ". Must be a whole number >= 0.");
        }
      },
      getStreamingThreshold: function getStreamingThreshold() {
        return utils.streamingThreshold;
      },
      /**
       * Parses an HTTP response object to return an X-Ray compliant HTTP response object.
       * @param {http.ServerResponse} res
       * @returns {Object} - X-Ray response object to be added to (sub)segment
       */
      getHttpResponseData: (res) => {
        const ret = {};
        if (!res) {
          return ret;
        }
        const status = safeParseInt(res.statusCode);
        if (status !== 0) {
          ret.status = status;
        }
        if (res.headers && res.headers["content-length"]) {
          ret.content_length = safeParseInt(res.headers["content-length"]);
        }
        return ret;
      },
      getJsonStringifyReplacer: () => (_, value) => {
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      }
    };
    module2.exports = utils;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/remote_request_data.js
var require_remote_request_data = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/remote_request_data.js"(exports2, module2) {
    "use strict";
    var { getHttpResponseData } = require_segment_utils();
    var { stripQueryStringFromPath } = require_utils();
    function RemoteRequestData(req, res, downstreamXRayEnabled) {
      this.init(req, res, downstreamXRayEnabled);
    }
    RemoteRequestData.prototype.init = function init(req, res, downstreamXRayEnabled) {
      this.request = {
        url: req.agent && req.agent.protocol ? req.agent.protocol + "//" + (req.host || req.getHeader("host")) + stripQueryStringFromPath(req.path) : "",
        method: req.method || ""
      };
      if (downstreamXRayEnabled) {
        this.request.traced = true;
      }
      if (res) {
        this.response = getHttpResponseData(res);
      }
    };
    module2.exports = RemoteRequestData;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/subsegment.js
var require_subsegment = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/subsegment.js"(exports2, module2) {
    "use strict";
    var crypto = require("crypto");
    var CapturedException = require_captured_exception();
    var RemoteRequestData = require_remote_request_data();
    var SegmentEmitter = require_segment_emitter();
    var SegmentUtils = require_segment_utils();
    var Utils = require_utils();
    var logger = require_logger();
    function Subsegment(name) {
      this.init(name);
    }
    Subsegment.prototype.init = function init(name) {
      if (typeof name != "string") {
        throw new Error("Subsegment name must be of type string.");
      }
      this.id = crypto.randomBytes(8).toString("hex");
      this.name = name;
      this.start_time = SegmentUtils.getCurrentTime();
      this.in_progress = true;
      this.counter = 0;
      this.notTraced = false;
    };
    Subsegment.prototype.addNewSubsegment = function addNewSubsegment(name) {
      const subsegment = new Subsegment(name);
      this.addSubsegment(subsegment);
      return subsegment;
    };
    Subsegment.prototype.addSubsegmentWithoutSampling = function addSubsegmentWithoutSampling(subsegment) {
      this.addSubsegment(subsegment);
      subsegment.notTraced = true;
    };
    Subsegment.prototype.addNewSubsegmentWithoutSampling = function addNewSubsegmentWithoutSampling(name) {
      const subsegment = new Subsegment(name);
      this.addSubsegment(subsegment);
      subsegment.notTraced = true;
      return subsegment;
    };
    Subsegment.prototype.addSubsegment = function(subsegment) {
      if (!(subsegment instanceof Subsegment)) {
        throw new Error("Failed to add subsegment:" + subsegment + ' to subsegment "' + this.name + '".  Not a subsegment.');
      }
      if (this.subsegments === void 0) {
        this.subsegments = [];
      }
      subsegment.segment = this.segment;
      subsegment.parent = this;
      subsegment.notTraced = subsegment.parent.notTraced;
      if (subsegment.end_time === void 0) {
        this.incrementCounter(subsegment.counter);
      }
      this.subsegments.push(subsegment);
    };
    Subsegment.prototype.removeSubsegment = function removeSubsegment(subsegment) {
      if (!(subsegment instanceof Subsegment)) {
        throw new Error("Failed to remove subsegment:" + subsegment + ' from subsegment "' + this.name + '".  Not a subsegment.');
      }
      if (this.subsegments !== void 0) {
        var index = this.subsegments.indexOf(subsegment);
        if (index >= 0) {
          this.subsegments.splice(index, 1);
        }
      }
    };
    Subsegment.prototype.addAttribute = function addAttribute(name, data) {
      this[name] = data;
    };
    Subsegment.prototype.addPrecursorId = function(id) {
      if (typeof id !== "string") {
        logger.getLogger().error("Failed to add id:" + id + " to subsegment " + this.name + ".  Precursor Ids must be of type string.");
      }
      if (this.precursor_ids === void 0) {
        this.precursor_ids = [];
      }
      this.precursor_ids.push(id);
    };
    Subsegment.prototype.addAnnotation = function(key, value) {
      if (typeof value !== "boolean" && typeof value !== "string" && !isFinite(value)) {
        logger.getLogger().error("Failed to add annotation key: " + key + " value: " + value + " to subsegment " + this.name + ". Value must be of type string, number or boolean.");
        return;
      }
      if (typeof key !== "string") {
        logger.getLogger().error("Failed to add annotation key: " + key + " value: " + value + " to subsegment " + this.name + ". Key must be of type string.");
        return;
      }
      if (this.annotations === void 0) {
        this.annotations = {};
      }
      this.annotations[key] = value;
    };
    Subsegment.prototype.addMetadata = function(key, value, namespace) {
      if (typeof key !== "string") {
        logger.getLogger().error("Failed to add metadata key: " + key + " value: " + value + " to subsegment " + this.name + ". Key must be of type string.");
        return;
      }
      if (namespace && typeof namespace !== "string") {
        logger.getLogger().error("Failed to add metadata key: " + key + " value: " + value + " to subsegment " + this.name + ". Namespace must be of type string.");
        return;
      }
      var ns = namespace || "default";
      if (!this.metadata) {
        this.metadata = {};
      }
      if (!this.metadata[ns]) {
        this.metadata[ns] = {};
      }
      if (ns !== "__proto__") {
        this.metadata[ns][key] = value !== null && value !== void 0 ? value : "";
      }
    };
    Subsegment.prototype.addSqlData = function addSqlData(sqlData) {
      this.sql = sqlData;
    };
    Subsegment.prototype.addError = function addError(err, remote) {
      if (err == null || typeof err !== "object" && typeof err !== "string") {
        logger.getLogger().error("Failed to add error:" + err + ' to subsegment "' + this.name + '".  Not an object or string literal.');
        return;
      }
      this.addFaultFlag();
      if (this.segment && this.segment.exception) {
        if (err === this.segment.exception.ex) {
          this.fault = true;
          this.cause = { id: this.segment.exception.cause, exceptions: [] };
          return;
        }
        delete this.segment.exception;
      }
      if (this.segment) {
        this.segment.exception = {
          ex: err,
          cause: this.id
        };
      } else {
      }
      if (this.cause === void 0) {
        this.cause = {
          working_directory: process.cwd(),
          exceptions: []
        };
      }
      this.cause.exceptions.unshift(new CapturedException(err, remote));
    };
    Subsegment.prototype.addRemoteRequestData = function addRemoteRequestData(req, res, downstreamXRayEnabled) {
      this.http = new RemoteRequestData(req, res, downstreamXRayEnabled);
      if ("traced" in this.http.request) {
        this.traced = this.http.request.traced;
        delete this.http.request.traced;
      }
    };
    Subsegment.prototype.addFaultFlag = function addFaultFlag() {
      this.fault = true;
    };
    Subsegment.prototype.addErrorFlag = function addErrorFlag() {
      this.error = true;
    };
    Subsegment.prototype.addThrottleFlag = function addThrottleFlag() {
      this.throttle = true;
    };
    Subsegment.prototype.close = function close(err, remote) {
      var root = this.segment;
      this.end_time = SegmentUtils.getCurrentTime();
      delete this.in_progress;
      if (err) {
        this.addError(err, remote);
      }
      if (this.parent) {
        this.parent.decrementCounter();
      }
      if (root && root.counter > SegmentUtils.getStreamingThreshold()) {
        if (this.streamSubsegments() && this.parent) {
          this.parent.removeSubsegment(this);
        }
      }
    };
    Subsegment.prototype.incrementCounter = function incrementCounter(additional) {
      this.counter = additional ? this.counter + additional + 1 : this.counter + 1;
      if (this.parent) {
        this.parent.incrementCounter(additional);
      }
    };
    Subsegment.prototype.decrementCounter = function decrementCounter() {
      this.counter--;
      if (this.parent) {
        this.parent.decrementCounter();
      }
    };
    Subsegment.prototype.isClosed = function isClosed() {
      return !this.in_progress;
    };
    Subsegment.prototype.flush = function flush() {
      if (!this.parent || !this.segment) {
        logger.getLogger().error("Failed to flush subsegment: " + this.name + ". Subsegment must be added to a segment chain to flush.");
        return;
      }
      if (this.segment.trace_id) {
        if (this.segment.notTraced !== true && !this.notTraced) {
          SegmentEmitter.send(this);
        } else {
          logger.getLogger().debug("Ignoring flush on subsegment " + this.id + ". Associated segment is marked as not sampled.");
        }
      } else {
        logger.getLogger().debug("Ignoring flush on subsegment " + this.id + ". Associated segment is missing a trace ID.");
      }
    };
    Subsegment.prototype.streamSubsegments = function streamSubsegments() {
      if (this.isClosed() && this.counter <= 0) {
        this.flush();
        return true;
      } else if (this.subsegments && this.subsegments.length > 0) {
        var open = [];
        this.subsegments.forEach(function(child) {
          if (!child.streamSubsegments()) {
            open.push(child);
          }
        });
        this.subsegments = open;
      }
    };
    Subsegment.prototype.format = function format() {
      this.type = "subsegment";
      if (this.parent) {
        this.parent_id = this.parent.id;
      }
      if (this.segment) {
        this.trace_id = this.segment.trace_id;
      }
      return this.serialize();
    };
    Subsegment.prototype.toString = function toString() {
      return this.serialize();
    };
    Subsegment.prototype.toJSON = function toJSON() {
      var ignore = ["segment", "parent", "counter"];
      if (this.subsegments == null || this.subsegments.length === 0) {
        ignore.push("subsegments");
      }
      var thisCopy = Utils.objectWithoutProperties(this, ignore, false);
      return thisCopy;
    };
    Subsegment.prototype.serialize = function serialize(object) {
      return JSON.stringify(object !== null && object !== void 0 ? object : this, SegmentUtils.getJsonStringifyReplacer());
    };
    module2.exports = Subsegment;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/segment.js
var require_segment = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/segment.js"(exports2, module2) {
    "use strict";
    var crypto = require("crypto");
    var CapturedException = require_captured_exception();
    var SegmentEmitter = require_segment_emitter();
    var SegmentUtils = require_segment_utils();
    var Subsegment = require_subsegment();
    var TraceID = require_trace_id();
    var Utils = require_utils();
    var logger = require_logger();
    function Segment(name, rootId, parentId) {
      this.init(name, rootId, parentId);
    }
    Segment.prototype.init = function init(name, rootId, parentId) {
      if (typeof name != "string") {
        throw new Error("Segment name must be of type string.");
      }
      var traceId;
      if (rootId && typeof rootId == "string") {
        traceId = TraceID.FromString(rootId);
      } else {
        traceId = new TraceID();
      }
      var id = crypto.randomBytes(8).toString("hex");
      var startTime = SegmentUtils.getCurrentTime();
      this.trace_id = traceId.toString();
      this.id = id;
      this.start_time = startTime;
      this.name = name || "";
      this.in_progress = true;
      this.counter = 0;
      if (parentId) {
        this.parent_id = parentId;
      }
      if (SegmentUtils.serviceData) {
        this.setServiceData(SegmentUtils.serviceData);
      }
      if (SegmentUtils.pluginData) {
        this.addPluginData(SegmentUtils.pluginData);
      }
      if (SegmentUtils.origin) {
        this.origin = SegmentUtils.origin;
      }
      if (SegmentUtils.sdkData) {
        this.setSDKData(SegmentUtils.sdkData);
      }
    };
    Segment.prototype.addIncomingRequestData = function addIncomingRequestData(data) {
      this.http = data;
    };
    Segment.prototype.addAnnotation = function addAnnotation(key, value) {
      if (typeof value !== "boolean" && typeof value !== "string" && !isFinite(value)) {
        logger.getLogger().error("Failed to add annotation key: " + key + " value: " + value + " to subsegment " + this.name + ". Value must be of type string, number or boolean.");
        return;
      }
      if (typeof key !== "string") {
        logger.getLogger().error("Failed to add annotation key: " + key + " value: " + value + " to subsegment " + this.name + ". Key must be of type string.");
        return;
      }
      if (this.annotations === void 0) {
        this.annotations = {};
      }
      this.annotations[key] = value;
    };
    Segment.prototype.setUser = function(user) {
      if (typeof user !== "string") {
        logger.getLogger().error("Set user: " + user + " failed. User IDs must be of type string.");
      }
      this.user = user;
    };
    Segment.prototype.addMetadata = function(key, value, namespace) {
      if (typeof key !== "string") {
        logger.getLogger().error("Failed to add metadata key: " + key + " value: " + value + " to segment " + this.name + ". Key must be of type string.");
        return;
      }
      if (namespace && typeof namespace !== "string") {
        logger.getLogger().error("Failed to add metadata key: " + key + " value: " + value + " to segment " + this.name + ". Namespace must be of type string.");
        return;
      }
      var ns = namespace || "default";
      if (!this.metadata) {
        this.metadata = {};
      }
      if (!this.metadata[ns]) {
        this.metadata[ns] = {};
      }
      if (ns !== "__proto__") {
        this.metadata[ns][key] = value !== null && value !== void 0 ? value : "";
      }
    };
    Segment.prototype.setSDKData = function setSDKData(data) {
      if (!data) {
        logger.getLogger().error("Add SDK data: " + data + " failed.Must not be empty.");
        return;
      }
      if (!this.aws) {
        this.aws = {};
      }
      this.aws.xray = data;
    };
    Segment.prototype.setMatchedSamplingRule = function setMatchedSamplingRule(ruleName) {
      if (this.aws) {
        this.aws = JSON.parse(JSON.stringify(this.aws));
      }
      if (this.aws && this.aws["xray"]) {
        this.aws.xray["rule_name"] = ruleName;
      } else {
        this.aws = { xray: { "rule_name": ruleName } };
      }
    };
    Segment.prototype.setServiceData = function setServiceData(data) {
      if (!data) {
        logger.getLogger().error("Add service data: " + data + " failed.Must not be empty.");
        return;
      }
      this.service = data;
    };
    Segment.prototype.addPluginData = function addPluginData(data) {
      if (this.aws === void 0) {
        this.aws = {};
      }
      Object.assign(this.aws, data);
    };
    Segment.prototype.addNewSubsegment = function addNewSubsegment(name) {
      var subsegment = new Subsegment(name);
      this.addSubsegment(subsegment);
      return subsegment;
    };
    Segment.prototype.addSubsegmentWithoutSampling = function addSubsegmentWithoutSampling(subsegment) {
      this.addSubsegment(subsegment);
      subsegment.notTraced = true;
    };
    Segment.prototype.addNewSubsegmentWithoutSampling = function addNewSubsegmentWithoutSampling(name) {
      const subsegment = new Subsegment(name);
      this.addSubsegment(subsegment);
      subsegment.notTraced = true;
      return subsegment;
    };
    Segment.prototype.addSubsegment = function addSubsegment(subsegment) {
      if (!(subsegment instanceof Subsegment)) {
        throw new Error("Cannot add subsegment: " + subsegment + ". Not a subsegment.");
      }
      if (this.subsegments === void 0) {
        this.subsegments = [];
      }
      subsegment.segment = this;
      subsegment.parent = this;
      subsegment.notTraced = subsegment.parent.notTraced;
      this.subsegments.push(subsegment);
      if (!subsegment.end_time) {
        this.incrementCounter(subsegment.counter);
      }
    };
    Segment.prototype.removeSubsegment = function removeSubsegment(subsegment) {
      if (!(subsegment instanceof Subsegment)) {
        throw new Error("Failed to remove subsegment:" + subsegment + ' from subsegment "' + this.name + '".  Not a subsegment.');
      }
      if (this.subsegments !== void 0) {
        var index = this.subsegments.indexOf(subsegment);
        if (index >= 0) {
          this.subsegments.splice(index, 1);
        }
      }
    };
    Segment.prototype.addError = function addError(err, remote) {
      if (err == null || typeof err !== "object" && typeof err !== "string") {
        logger.getLogger().error("Failed to add error:" + err + ' to subsegment "' + this.name + '".  Not an object or string literal.');
        return;
      }
      this.addFaultFlag();
      if (this.exception) {
        if (err === this.exception.ex) {
          this.cause = { id: this.exception.cause };
          delete this.exception;
          return;
        }
        delete this.exception;
      }
      if (this.cause === void 0) {
        this.cause = {
          working_directory: process.cwd(),
          exceptions: []
        };
      }
      this.cause.exceptions.push(new CapturedException(err, remote));
    };
    Segment.prototype.addFaultFlag = function addFaultFlag() {
      this.fault = true;
    };
    Segment.prototype.addErrorFlag = function addErrorFlag() {
      this.error = true;
    };
    Segment.prototype.addThrottleFlag = function addThrottleFlag() {
      this.throttle = true;
    };
    Segment.prototype.isClosed = function isClosed() {
      return !this.in_progress;
    };
    Segment.prototype.incrementCounter = function incrementCounter(additional) {
      this.counter = additional ? this.counter + additional + 1 : this.counter + 1;
      if (this.counter > SegmentUtils.streamingThreshold && this.subsegments && this.subsegments.length > 0) {
        var open = [];
        this.subsegments.forEach(function(child) {
          if (!child.streamSubsegments()) {
            open.push(child);
          }
        });
        this.subsegments = open;
      }
    };
    Segment.prototype.decrementCounter = function decrementCounter() {
      this.counter--;
      if (this.counter <= 0 && this.isClosed()) {
        this.flush();
      }
    };
    Segment.prototype.close = function(err, remote) {
      if (!this.end_time) {
        this.end_time = SegmentUtils.getCurrentTime();
      }
      if (err !== void 0) {
        this.addError(err, remote);
      }
      delete this.in_progress;
      delete this.exception;
      if (this.counter <= 0) {
        this.flush();
      }
    };
    Segment.prototype.flush = function flush() {
      if (this.notTraced !== true) {
        delete this.exception;
        var thisCopy = Utils.objectWithoutProperties(this, ["counter", "notTraced"], true);
        SegmentEmitter.send(thisCopy);
      }
    };
    Segment.prototype.format = function format() {
      var ignore = ["segment", "parent", "counter"];
      if (this.subsegments == null || this.subsegments.length === 0) {
        ignore.push("subsegments");
      }
      var thisCopy = Utils.objectWithoutProperties(this, ignore, false);
      return this.serialize(thisCopy);
    };
    Segment.prototype.toString = function toString() {
      return this.serialize();
    };
    Segment.prototype.serialize = function serialize(object) {
      return JSON.stringify(object !== null && object !== void 0 ? object : this, SegmentUtils.getJsonStringifyReplacer());
    };
    module2.exports = Segment;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/context_utils.js
var require_context_utils = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/context_utils.js"(exports2, module2) {
    "use strict";
    var cls = require_context();
    var logger = require_logger();
    var Segment = require_segment();
    var Subsegment = require_subsegment();
    var cls_mode = true;
    var NAMESPACE = "AWSXRay";
    var SEGMENT = "segment";
    var contextOverride = false;
    var contextUtils = {
      CONTEXT_MISSING_STRATEGY: {
        RUNTIME_ERROR: {
          contextMissing: function contextMissingRuntimeError(message) {
            throw new Error(message);
          }
        },
        LOG_ERROR: {
          contextMissing: function contextMissingLogError(message) {
            var err = new Error(message);
            logger.getLogger().error(err.stack);
          }
        },
        IGNORE_ERROR: {
          contextMissing: function contextMissingIgnoreError() {
          }
        }
      },
      contextMissingStrategy: {},
      /**
       * Resolves the segment or subsegment given manual mode and params on the call required.
       * @param [Segment|Subsegment] segment - The segment manually provided via params.XraySegment, if provided.
       * @returns {Segment|Subsegment}
       * @alias module:context_utils.resolveManualSegmentParams
       */
      resolveManualSegmentParams: function resolveManualSegmentParams(params) {
        if (params && !contextUtils.isAutomaticMode()) {
          var xraySegment = params.XRaySegment || params.XraySegment;
          var segment = params.Segment;
          var found = null;
          if (xraySegment && (xraySegment instanceof Segment || xraySegment instanceof Subsegment)) {
            found = xraySegment;
            delete params.XRaySegment;
            delete params.XraySegment;
          } else if (segment && (segment instanceof Segment || segment instanceof Subsegment)) {
            found = segment;
            delete params.Segment;
          }
          return found;
        }
      },
      /**
       * Gets current CLS namespace for X-Ray SDK or creates one if absent.
       * @returns {Namespace}
       * @alias module:context_utils.getNamespace
       */
      getNamespace: function getNamespace() {
        return cls.getNamespace(NAMESPACE) || cls.createNamespace(NAMESPACE);
      },
      /**
       * Resolves the segment or subsegment given manual or automatic mode.
       * @param [Segment|Subsegment] segment - The segment manually provided, if provided.
       * @returns {Segment|Subsegment}
       * @alias module:context_utils.resolveSegment
       */
      resolveSegment: function resolveSegment(segment) {
        if (cls_mode) {
          return this.getSegment();
        } else if (segment && !cls_mode) {
          return segment;
        } else if (!segment && !cls_mode) {
          contextUtils.contextMissingStrategy.contextMissing("No sub/segment specified. A sub/segment must be provided for manual mode.");
        }
      },
      /**
       * Returns the current segment or subsegment.  For use with in automatic mode only.
       * @returns {Segment|Subsegment}
       * @alias module:context_utils.getSegment
       */
      getSegment: function getSegment() {
        if (cls_mode) {
          var segment = contextUtils.getNamespace(NAMESPACE).get(SEGMENT);
          if (!segment) {
            contextUtils.contextMissingStrategy.contextMissing("Failed to get the current sub/segment from the context.");
          } else if (segment instanceof Segment && process.env.LAMBDA_TASK_ROOT && segment.facade == true) {
            segment.resolveLambdaTraceData();
          }
          return segment;
        } else {
          contextUtils.contextMissingStrategy.contextMissing("Cannot get sub/segment from context. Not supported in manual mode.");
        }
      },
      /**
       * Sets the current segment or subsegment.  For use with in automatic mode only.
       * @param [Segment|Subsegment] segment - The sub/segment to set.
       * @returns {Segment|Subsegment}
       * @alias module:context_utils.setSegment
       */
      setSegment: function setSegment(segment) {
        if (cls_mode) {
          if (!contextUtils.getNamespace(NAMESPACE).set(SEGMENT, segment)) {
            logger.getLogger().warn("Failed to set the current sub/segment on the context.");
          }
        } else {
          contextUtils.contextMissingStrategy.contextMissing("Cannot set sub/segment on context. Not supported in manual mode.");
        }
      },
      /**
       * Returns true if in automatic mode, otherwise false.
       * @returns {Segment|Subsegment}
       * @alias module:context_utils.isAutomaticMode
       */
      isAutomaticMode: function isAutomaticMode() {
        return cls_mode;
      },
      /**
       * Enables automatic mode. Automatic mode uses 'cls-hooked'.
       * @see https://github.com/jeff-lewis/cls-hooked
       * @alias module:context_utils.enableAutomaticMode
       */
      enableAutomaticMode: function enableAutomaticMode() {
        cls_mode = true;
        contextUtils.getNamespace(NAMESPACE);
        logger.getLogger().debug("Overriding AWS X-Ray SDK mode. Set to automatic mode.");
      },
      /**
       * Disables automatic mode. Current segment or subsegment then must be passed manually
       * via the parent optional on captureFunc, captureAsyncFunc etc.
       * @alias module:context_utils.enableManualMode
       */
      enableManualMode: function enableManualMode() {
        cls_mode = false;
        if (cls.getNamespace(NAMESPACE)) {
          cls.destroyNamespace(NAMESPACE);
        }
        logger.getLogger().debug("Overriding AWS X-Ray SDK mode. Set to manual mode.");
      },
      /**
       * Sets the context missing strategy if no context missing strategy is set using the environment variable with
       * key AWS_XRAY_CONTEXT_MISSING. The context missing strategy's contextMissing function will be called whenever
       * trace context is not found.
       * @param {string|function} strategy - The strategy to set. Valid string values are 'LOG_ERROR' and 'RUNTIME_ERROR'.
       *                                     Alternatively, a custom function can be supplied, which takes a error message string.
       */
      setContextMissingStrategy: function setContextMissingStrategy2(strategy) {
        if (!contextOverride) {
          if (typeof strategy === "string") {
            var lookupStrategy = contextUtils.CONTEXT_MISSING_STRATEGY[strategy.toUpperCase()];
            if (lookupStrategy) {
              contextUtils.contextMissingStrategy.contextMissing = lookupStrategy.contextMissing;
              if (process.env.AWS_XRAY_CONTEXT_MISSING) {
                logger.getLogger().debug("AWS_XRAY_CONTEXT_MISSING is set. Configured context missing strategy to " + process.env.AWS_XRAY_CONTEXT_MISSING + ".");
              } else {
                logger.getLogger().debug("Configured context missing strategy to: " + strategy);
              }
            } else {
              throw new Error("Invalid context missing strategy: " + strategy + ". Valid values are " + Object.keys(contextUtils.CONTEXT_MISSING_STRATEGY) + ".");
            }
          } else if (typeof strategy === "function") {
            contextUtils.contextMissingStrategy.contextMissing = strategy;
            logger.getLogger().info("Configured custom context missing strategy to function: " + strategy.name);
          } else {
            throw new Error("Context missing strategy must be either a string or a custom function.");
          }
        } else {
          logger.getLogger().warn("Ignoring call to setContextMissingStrategy as AWS_XRAY_CONTEXT_MISSING is set. The current context missing strategy will not be changed.");
        }
      }
    };
    if (process.env.AWS_XRAY_MANUAL_MODE) {
      cls_mode = false;
      logger.getLogger().debug("Starting the AWS X-Ray SDK in manual mode.");
    } else {
      cls.createNamespace(NAMESPACE);
      logger.getLogger().debug("Starting the AWS X-Ray SDK in automatic mode (default).");
    }
    if (process.env.AWS_XRAY_CONTEXT_MISSING) {
      contextUtils.setContextMissingStrategy(process.env.AWS_XRAY_CONTEXT_MISSING);
      contextOverride = true;
    } else {
      contextUtils.contextMissingStrategy.contextMissing = contextUtils.CONTEXT_MISSING_STRATEGY.LOG_ERROR.contextMissing;
      logger.getLogger().debug("Using default context missing strategy: LOG_ERROR");
    }
    module2.exports = contextUtils;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/incoming_request_data.js
var require_incoming_request_data = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/incoming_request_data.js"(exports2, module2) {
    "use strict";
    var { getHttpResponseData } = require_segment_utils();
    function IncomingRequestData(req) {
      this.init(req);
    }
    IncomingRequestData.prototype.init = function init(req) {
      var forwarded = !!req.headers["x-forwarded-for"];
      var url;
      if (req.connection) {
        url = (req.connection.secure || req.connection.encrypted ? "https://" : "http://") + ((req.headers["host"] || "") + (req.url || ""));
      }
      this.request = {
        method: req.method || "",
        user_agent: req.headers["user-agent"] || "",
        client_ip: getClientIp(req) || "",
        url: url || ""
      };
      if (forwarded) {
        this.request.x_forwarded_for = forwarded;
      }
    };
    var getClientIp = function getClientIp2(req) {
      var clientIp;
      if (req.headers["x-forwarded-for"]) {
        clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0];
      } else if (req.connection && req.connection.remoteAddress) {
        clientIp = req.connection.remoteAddress;
      } else if (req.socket && req.socket.remoteAddress) {
        clientIp = req.socket.remoteAddress;
      } else if (req.connection && req.connection.socket && req.connection.socket.remoteAddress) {
        clientIp = req.connection.socket.remoteAddress;
      }
      return clientIp;
    };
    IncomingRequestData.prototype.close = function close(res) {
      this.response = getHttpResponseData(res);
    };
    module2.exports = IncomingRequestData;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/local_reservoir.js
var require_local_reservoir = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/local_reservoir.js"(exports2, module2) {
    "use strict";
    function LocalReservoir(fixedTarget, fallbackRate) {
      this.init(fixedTarget, fallbackRate);
    }
    LocalReservoir.prototype.init = function init(fixedTarget, fallbackRate) {
      this.usedThisSecond = 0;
      if (typeof fixedTarget === "number" && fixedTarget % 1 === 0 && fixedTarget >= 0) {
        this.fixedTarget = fixedTarget;
      } else {
        throw new Error('Error in sampling file. Rule attribute "fixed_target" must be a non-negative integer.');
      }
      if (typeof fallbackRate === "number" && fallbackRate >= 0 && fallbackRate <= 1) {
        this.fallbackRate = fallbackRate;
      } else {
        throw new Error('Error in sampling file. Rule attribute "rate" must be a number between 0 and 1 inclusive.');
      }
    };
    LocalReservoir.prototype.isSampled = function isSampled() {
      var now = Math.round((/* @__PURE__ */ new Date()).getTime() / 1e3);
      if (now !== this.thisSecond) {
        this.usedThisSecond = 0;
        this.thisSecond = now;
      }
      if (this.usedThisSecond >= this.fixedTarget) {
        return Math.random() < this.fallbackRate;
      }
      this.usedThisSecond++;
      return true;
    };
    module2.exports = LocalReservoir;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/resources/default_sampling_rules.json
var require_default_sampling_rules = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/resources/default_sampling_rules.json"(exports2, module2) {
    module2.exports = {
      default: {
        fixed_target: 1,
        rate: 0.05
      },
      version: 2
    };
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/local_sampler.js
var require_local_sampler = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/local_sampler.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var LocalReservoir = require_local_reservoir();
    var Utils = require_utils();
    var defaultRules = require_default_sampling_rules();
    var logger = require_logger();
    var LocalSampler = {
      /**
       * Makes a sample decision based on the sample request.
       * @param {object} sampleRequest - Contains information for rules matching.
       * @module LocalSampler
       * @function shouldSample
       */
      shouldSample: function shouldSample(sampleRequest) {
        var host = sampleRequest.host;
        var httpMethod = sampleRequest.httpMethod;
        var urlPath = sampleRequest.urlPath;
        var formatted = "{ http_method: " + httpMethod + ", host: " + host + ", url_path: " + urlPath + " }";
        var matched;
        this.rules.some(function(rule) {
          if (rule.default || (host == null || Utils.wildcardMatch(rule.host, host) && (httpMethod == null || Utils.wildcardMatch(rule.http_method, httpMethod)) && (urlPath == null || Utils.wildcardMatch(rule.url_path, urlPath)))) {
            matched = rule.reservoir;
            logger.getLogger().debug("Local sampling rule match found for " + formatted + ". Matched " + (rule.default ? "default" : "{ http_method: " + rule.http_method + ", host: " + rule.host + ", url_path: " + rule.url_path + " }") + ". Using fixed_target: " + matched.fixedTarget + " and rate: " + matched.fallbackRate + ".");
            return true;
          }
        });
        if (matched) {
          return matched.isSampled();
        } else {
          logger.getLogger().debug("No sampling rule matched for " + formatted);
          return false;
        }
      },
      /**
       * Set local rules for making sampling decisions.
       * @module LocalSampler
       * @function setLocalRules
       */
      setLocalRules: function setLocalRules(source) {
        if (source) {
          if (typeof source === "string") {
            logger.getLogger().info("Using custom sampling rules file: " + source);
            this.rules = loadRulesConfig(JSON.parse(fs.readFileSync(source, "utf8")));
          } else {
            logger.getLogger().info("Using custom sampling rules source.");
            this.rules = loadRulesConfig(source);
          }
        } else {
          this.rules = parseRulesConfig(defaultRules);
        }
      }
    };
    var loadRulesConfig = function loadRulesConfig2(config) {
      if (!config.version) {
        throw new Error('Error in sampling file. Missing "version" attribute.');
      }
      if (config.version === 1 || config.version === 2) {
        return parseRulesConfig(config);
      } else {
        throw new Error('Error in sampling file. Unknown version "' + config.version + '".');
      }
    };
    var parseRulesConfig = function parseRulesConfig2(config) {
      var defaultRule;
      var rules = [];
      if (config.default) {
        var missing = [];
        for (var key in config.default) {
          if (key !== "fixed_target" && key !== "rate") {
            throw new Error("Error in sampling file. Invalid attribute for default: " + key + '. Valid attributes for default are "fixed_target" and "rate".');
          } else if (typeof config.default[key] !== "number") {
            throw new Error("Error in sampling file. Default " + key + " must be a number.");
          }
        }
        if (typeof config.default.fixed_target === "undefined") {
          missing.push("fixed_target");
        }
        if (typeof config.default.rate === "undefined") {
          missing.push("rate");
        }
        if (missing.length !== 0) {
          throw new Error("Error in sampling file. Missing required attributes for default: " + missing + ".");
        }
        defaultRule = { default: true, reservoir: new LocalReservoir(config.default.fixed_target, config.default.rate) };
      } else {
        throw new Error('Error in sampling file. Expecting "default" object to be defined with attributes "fixed_target" and "rate".');
      }
      if (Array.isArray(config.rules)) {
        config.rules.forEach(function(rawRule) {
          var params = {};
          var required;
          if (config.version === 2) {
            required = { host: 1, http_method: 1, url_path: 1, fixed_target: 1, rate: 1 };
          }
          if (config.version === 1) {
            required = { service_name: 1, http_method: 1, url_path: 1, fixed_target: 1, rate: 1 };
          }
          for (var key2 in rawRule) {
            var value = rawRule[key2];
            if (!required[key2] && key2 != "description") {
              throw new Error("Error in sampling file. Rule " + JSON.stringify(rawRule) + " has invalid attribute: " + key2 + ".");
            } else if (key2 != "description" && !value && value !== 0) {
              throw new Error("Error in sampling file. Rule " + JSON.stringify(rawRule) + ' attribute "' + key2 + '" has invalid value: ' + value + ".");
            } else {
              if (config.version === 2) {
                params[key2] = value;
              }
              if (config.version === 1 && key2 === "service_name") {
                params["host"] = value;
              } else {
                params[key2] = value;
              }
              delete required[key2];
            }
          }
          if (Object.keys(required).length !== 0 && required.constructor === Object) {
            throw new Error("Error in sampling file. Rule " + JSON.stringify(rawRule) + " is missing required attributes: " + Object.keys(required) + ".");
          }
          var rule = params;
          rule.reservoir = new LocalReservoir(rawRule.fixed_target, rawRule.rate);
          rules.push(rule);
        });
      }
      rules.push(defaultRule);
      return rules;
    };
    LocalSampler.setLocalRules();
    module2.exports = LocalSampler;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/reservoir.js
var require_reservoir = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/reservoir.js"(exports2, module2) {
    "use strict";
    function Reservoir() {
      this.init();
    }
    Reservoir.prototype.init = function init() {
      this.quota = null;
      this.TTL = null;
      this.takenThisSec = 0;
      this.borrowedThisSec = 0;
      this.reportInterval = 1;
      this.reportElapsed = 0;
    };
    Reservoir.prototype.borrowOrTake = function borrowOrTake(now, canBorrow) {
      this.adjustThisSec(now);
      if (this.quota >= 0 && this.TTL >= now) {
        if (this.takenThisSec >= this.quota) {
          return false;
        }
        this.takenThisSec++;
        return "take";
      }
      if (canBorrow) {
        if (this.borrowedThisSec >= 1) {
          return false;
        }
        this.borrowedThisSec++;
        return "borrow";
      }
    };
    Reservoir.prototype.adjustThisSec = function adjustThisSec(now) {
      if (now !== this.thisSec) {
        this.takenThisSec = 0;
        this.borrowedThisSec = 0;
        this.thisSec = now;
      }
    };
    Reservoir.prototype.loadNewQuota = function loadNewQuota(quota, TTL, interval) {
      if (quota) {
        this.quota = quota;
      }
      if (TTL) {
        this.TTL = TTL;
      }
      if (interval) {
        this.reportInterval = interval / 10;
      }
    };
    Reservoir.prototype.timeToReport = function timeToReport() {
      if (this.reportElapsed + 1 >= this.reportInterval) {
        this.reportElapsed = 0;
        return true;
      } else {
        this.reportElapsed += 1;
        return false;
      }
    };
    module2.exports = Reservoir;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/sampling_rule.js
var require_sampling_rule = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/sampling_rule.js"(exports2, module2) {
    "use strict";
    var Utils = require_utils();
    var Reservoir = require_reservoir();
    function SamplingRule(name, priority, rate, reservoirSize, host, httpMethod, urlPath, serviceName, serviceType) {
      this.init(name, priority, rate, reservoirSize, host, httpMethod, urlPath, serviceName, serviceType);
    }
    SamplingRule.prototype.init = function init(name, priority, rate, reservoirSize, host, httpMethod, urlPath, serviceName, serviceType) {
      this.name = name;
      this.priority = priority;
      this.rate = rate;
      this.host = host;
      this.httpMethod = httpMethod;
      this.urlPath = urlPath;
      this.serviceName = serviceName;
      this.serviceType = serviceType;
      this.reservoir = new Reservoir();
      this.borrow = !!reservoirSize;
      this.resetStatistics();
    };
    SamplingRule.prototype.match = function match(sampleRequest) {
      var host = sampleRequest.host;
      var httpMethod = sampleRequest.httpMethod;
      var serviceName = sampleRequest.serviceName;
      var urlPath = sampleRequest.urlPath;
      var serviceType = sampleRequest.serviceType;
      return this.isDefault() || (!host || Utils.wildcardMatch(this.host, host)) && (!httpMethod || Utils.wildcardMatch(this.httpMethod, httpMethod)) && (!serviceName || Utils.wildcardMatch(this.serviceName, serviceName)) && (!urlPath || Utils.wildcardMatch(this.urlPath, urlPath)) && (!serviceType || Utils.wildcardMatch(this.serviceType, serviceType));
    };
    SamplingRule.prototype.snapshotStatistics = function snapshotStatistics() {
      var statistics = {
        requestCount: this.requestCount,
        borrowCount: this.borrowCount,
        sampledCount: this.sampledCount
      };
      this.resetStatistics();
      return statistics;
    };
    SamplingRule.prototype.merge = function merge(rule) {
      this.reservoir = rule.reservoir;
      this.requestCount = rule.requestCount;
      this.borrowCount = rule.borrowCount;
      this.sampledCount = rule.sampledCount;
      rule = null;
    };
    SamplingRule.prototype.isDefault = function isDefault() {
      return this.name === "Default";
    };
    SamplingRule.prototype.incrementRequestCount = function incrementRequestCount() {
      this.requestCount++;
    };
    SamplingRule.prototype.incrementBorrowCount = function incrementBorrowCount() {
      this.borrowCount++;
    };
    SamplingRule.prototype.incrementSampledCount = function incrementSampledCount() {
      this.sampledCount++;
    };
    SamplingRule.prototype.setRate = function setRate(rate) {
      this.rate = rate;
    };
    SamplingRule.prototype.getRate = function getRate() {
      return this.rate;
    };
    SamplingRule.prototype.getName = function getName() {
      return this.name;
    };
    SamplingRule.prototype.getPriority = function getPriority() {
      return this.priority;
    };
    SamplingRule.prototype.getReservoir = function getReservoir() {
      return this.reservoir;
    };
    SamplingRule.prototype.resetStatistics = function resetStatistics() {
      this.requestCount = 0;
      this.borrowCount = 0;
      this.sampledCount = 0;
    };
    SamplingRule.prototype.canBorrow = function canBorrow() {
      return this.borrow;
    };
    SamplingRule.prototype.everMatched = function everMatched() {
      return this.requestCount > 0;
    };
    SamplingRule.prototype.timeToReport = function timeToReport() {
      return this.reservoir.timeToReport();
    };
    module2.exports = SamplingRule;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/service_connector.js
var require_service_connector = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/service_connector.js"(exports2, module2) {
    "use strict";
    var crypto = require("crypto");
    var logger = require_logger();
    var SamplingRule = require_sampling_rule();
    var DaemonConfig = require_daemon_config();
    var util = require("util");
    var http = require("http");
    var ServiceConnector = {
      // client_id is a 12 byte cryptographically secure random hex
      // identifying the SDK instance and is generated during SDK initialization/
      // This is required when reporting sampling to X-Ray back-end.
      clientId: crypto.randomBytes(12).toString("hex"),
      samplingRulesPath: "/GetSamplingRules",
      samplingTargetsPath: "/SamplingTargets",
      logger,
      httpClient: http,
      fetchSamplingRules: function fetchSamplingRules(callback) {
        const body = "{}";
        const options = getOptions(this.samplingRulesPath, body.length);
        const httpReq = this.httpClient.__request ? this.httpClient.__request : this.httpClient.request;
        const req = httpReq(options, (res) => {
          var data = "";
          res.on("data", (d) => {
            data += d;
          });
          res.on("error", (error) => {
            callback(error);
          });
          res.on("end", () => {
            var dataObj;
            try {
              dataObj = JSON.parse(data);
            } catch (err) {
              callback(err);
              return;
            }
            if (!dataObj) {
              callback(new Error("AWS X-Ray GetSamplingRules API returned empty response"));
              return;
            }
            var newRules = assembleRules(dataObj);
            callback(null, newRules);
          });
        });
        req.on("error", () => {
          callback(new Error(`Failed to connect to X-Ray daemon at ${options.hostname}:${options.port} to get sampling rules.`));
        });
        req.write(body);
        req.end();
      },
      fetchTargets: function fetchTargets(rules, callback) {
        const body = JSON.stringify(constructStatisticsDocs(rules));
        const options = getOptions(this.samplingTargetsPath, body.length);
        const httpReq = this.httpClient.__request ? this.httpClient.__request : this.httpClient.request;
        const req = httpReq(options, (res) => {
          var data = "";
          res.on("data", (d) => {
            data += d;
          });
          res.on("error", (error) => {
            callback(error);
          });
          res.on("end", () => {
            var dataObj;
            try {
              dataObj = JSON.parse(data);
            } catch (err) {
              callback(err);
              return;
            }
            if (!dataObj || typeof dataObj["LastRuleModification"] != "number") {
              callback(new Error("AWS X-Ray SamplingTargets API returned invalid response"));
              return;
            }
            var targetsMapping = assembleTargets(dataObj);
            var ruleFreshness = dateToEpoch(dataObj["LastRuleModification"]);
            callback(null, targetsMapping, ruleFreshness);
          });
        });
        req.on("error", () => {
          callback(new Error(`Failed to connect to X-Ray daemon at ${options.hostname}:${options.port} to get sampling targets.`));
        });
        req.write(body);
        req.end();
      }
    };
    var constructStatisticsDocs = function constructStatisticsDocs2(rules) {
      var documents = [];
      var now = Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3);
      rules.forEach(function(rule) {
        var statistics = rule.snapshotStatistics();
        var doc = {
          "RuleName": rule.getName(),
          "ClientID": ServiceConnector.clientId,
          "RequestCount": statistics.requestCount,
          "BorrowCount": statistics.borrowCount,
          "SampledCount": statistics.sampledCount,
          "Timestamp": now
        };
        documents.push(doc);
      });
      return { SamplingStatisticsDocuments: documents };
    };
    var assembleRules = function assembleRules2(data) {
      var newRules = [];
      var ruleList = data["SamplingRuleRecords"] || [];
      ruleList.forEach(function(ruleRecord) {
        ruleRecord = ruleRecord["SamplingRule"];
        if (isRuleValid(ruleRecord)) {
          var newRule = new SamplingRule(ruleRecord["RuleName"], ruleRecord["Priority"], ruleRecord["FixedRate"], ruleRecord["ReservoirSize"], ruleRecord["Host"], ruleRecord["HTTPMethod"], ruleRecord["URLPath"], ruleRecord["ServiceName"], ruleRecord["ServiceType"]);
          newRules.push(newRule);
        }
      });
      return newRules;
    };
    var assembleTargets = function assembleTargets2(data) {
      var docs = data["SamplingTargetDocuments"] || [];
      var targetsMapping = {};
      docs.forEach(function(doc) {
        var newTarget = {
          rate: doc["FixedRate"],
          quota: doc["ReservoirQuota"],
          TTL: dateToEpoch(doc["ReservoirQuotaTTL"]),
          interval: doc["Interval"]
        };
        targetsMapping[doc["RuleName"]] = newTarget;
      });
      return targetsMapping;
    };
    var isRuleValid = function isRuleValid2(record) {
      return record["Version"] === 1 && record["ResourceARN"] === "*" && record["Attributes"] && Object.keys(record["Attributes"]).length === 0 && record["ServiceType"] && record["RuleName"] && record["Priority"] && typeof record["FixedRate"] == "number";
    };
    var dateToEpoch = function dateToEpoch2(date) {
      return new Date(date).getTime() / 1e3;
    };
    var getOptions = function getOptions2(path, contentLength) {
      const options = {
        hostname: DaemonConfig.tcp_ip,
        port: DaemonConfig.tcp_port,
        method: "POST",
        path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": contentLength,
          "Host": util.format("%s:%d", DaemonConfig.tcp_ip, DaemonConfig.tcp_port)
        }
      };
      return options;
    };
    module2.exports = ServiceConnector;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/rule_cache.js
var require_rule_cache = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/rule_cache.js"(exports2, module2) {
    "use strict";
    var TTL = 60 * 60;
    var RuleCache = {
      rules: [],
      lastUpdated: null,
      /**
       * Tries to find a valid rule that matches the sample request.
       * @param {object} sampleRequest - Contains information for rules matching.
       * @param {number} now - Current epoch in seconds.
       * @module RuleCache
       * @function getMatchedRule
       */
      getMatchedRule: function getMatchedRule(sampleRequest, now) {
        if (isExpired(now)) {
          return null;
        }
        var matchedRule;
        this.rules.forEach(function(rule) {
          if (!matchedRule && rule.match(sampleRequest)) {
            matchedRule = rule;
          }
          if (rule.isDefault() && !matchedRule) {
            matchedRule = rule;
          }
        });
        return matchedRule;
      },
      /**
       * Load rules fetched from X-Ray service in order sorted by priorities.
       * @param {object} rules - Newly fetched rules to load.
       * @module RuleCache
       * @function loadRules
       */
      loadRules: function loadRules(rules) {
        var oldRules = {};
        this.rules.forEach(function(rule) {
          oldRules[rule.getName()] = rule;
        });
        this.rules = rules;
        this.rules.forEach(function(rule) {
          var oldRule = oldRules[rule.getName()];
          if (oldRule) {
            rule.merge(oldRule);
          }
        });
        this.rules.sort(function(a, b) {
          var v = a.getPriority() - b.getPriority();
          if (v !== 0) {
            return v;
          }
          if (a.getName() > b.getName()) {
            return 1;
          } else {
            return -1;
          }
        });
      },
      /**
       * Load targets fetched from X-Ray service.
       * @param {object} targetsMapping - Newly fetched targets map with rule name as key.
       * @module RuleCache
       * @function loadTargets
       */
      loadTargets: function loadTargets(targetsMapping) {
        this.rules.forEach(function(rule) {
          var target = targetsMapping[rule.getName()];
          if (target) {
            rule.getReservoir().loadNewQuota(target.quota, target.TTL, target.interval);
            rule.setRate(target.rate);
          }
        });
      },
      getRules: function getRules() {
        return this.rules;
      },
      timestamp: function timestamp(now) {
        this.lastUpdated = now;
      },
      getLastUpdated: function getLastUpdated() {
        return this.lastUpdated;
      }
    };
    var isExpired = function isExpired2(now) {
      if (!RuleCache.getLastUpdated()) {
        return true;
      }
      return now > RuleCache.getLastUpdated() + TTL;
    };
    module2.exports = RuleCache;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/rule_poller.js
var require_rule_poller = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/rule_poller.js"(exports2, module2) {
    "use strict";
    var logger = require_logger();
    var ServiceConnector = require_service_connector();
    var ruleCache = require_rule_cache();
    var DEFAULT_INTERVAL = 5 * 60 * 1e3;
    var RulePoller = {
      start: function start() {
        if (this.poller) {
          clearInterval(this.poller);
        }
        refresh(false);
        this.poller = setInterval(refresh, DEFAULT_INTERVAL);
        this.poller.unref();
      }
    };
    var refresh = function refresh2(jitter) {
      jitter = typeof jitter === "undefined" ? true : jitter;
      if (jitter) {
        var delay = getJitter();
        setTimeout(refreshWithFirewall, delay);
      } else {
        refreshWithFirewall();
      }
    };
    var refreshWithFirewall = function refreshWithFirewall2() {
      try {
        refreshCache();
      } catch (e) {
        logger.getLogger().warn("Encountered unexpected exception when fetching sampling rules: " + e);
      }
    };
    var refreshCache = function refreshCache2() {
      var now = Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3);
      ServiceConnector.fetchSamplingRules(function(err, newRules) {
        if (err) {
          logger.getLogger().warn("Failed to retrieve sampling rules from X-Ray service:", err);
        } else if (newRules.length !== 0) {
          ruleCache.loadRules(newRules);
          ruleCache.timestamp(now);
          logger.getLogger().info("Successfully refreshed centralized sampling rule cache.");
        }
      });
    };
    var getJitter = function getJitter2() {
      return Math.random() * 5;
    };
    module2.exports = RulePoller;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/target_poller.js
var require_target_poller = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/target_poller.js"(exports2, module2) {
    "use strict";
    var rulePoller = require_rule_poller();
    var serviceConnector = require_service_connector();
    var ruleCache = require_rule_cache();
    var logger = require_logger();
    var DEFAULT_INTERVAL = 10 * 1e3;
    var TargetPoller = {
      interval: DEFAULT_INTERVAL,
      start: function start() {
        this.poller = setInterval(refreshWithFirewall, DEFAULT_INTERVAL + getJitter());
        this.poller.unref();
      }
    };
    var refreshWithFirewall = function refreshWithFirewall2() {
      try {
        refresh();
      } catch (e) {
        logger.getLogger().warn("Encountered unexpected exception when fetching sampling targets: " + e);
      }
    };
    var refresh = function refresh2() {
      var candidates = getCandidates();
      if (candidates && candidates.length > 0) {
        serviceConnector.fetchTargets(candidates, function(err, targetsMapping, ruleFreshness) {
          if (err) {
            logger.getLogger().warn("Failed to retrieve sampling targets from X-Ray service:", err);
            return;
          }
          ruleCache.loadTargets(targetsMapping);
          if (ruleFreshness > ruleCache.getLastUpdated()) {
            logger.getLogger().info("Performing out-of-band sampling rule polling to fetch updated rules.");
            rulePoller.start();
          }
          logger.getLogger().info("Successfully reported rule statistics to get new sampling quota.");
        });
      }
    };
    var getCandidates = function getCandidates2() {
      var rules = ruleCache.getRules();
      var candidates = [];
      rules.forEach(function(rule) {
        if (rule.everMatched() && rule.timeToReport()) {
          candidates.push(rule);
        }
      });
      return candidates;
    };
    var getJitter = function getJitter2() {
      return Math.random() / TargetPoller.interval;
    };
    module2.exports = TargetPoller;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/default_sampler.js
var require_default_sampler = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/sampling/default_sampler.js"(exports2, module2) {
    "use strict";
    var logger = require_logger();
    var util = require("util");
    var SegmentUtils = require_segment_utils();
    var DefaultSampler = {
      localSampler: require_local_sampler(),
      rulePoller: require_rule_poller(),
      targetPoller: require_target_poller(),
      ruleCache: require_rule_cache(),
      started: false,
      /**
       * Makes a sample decision based on the sample request.
       * @param {object} sampleRequest - Contains information for rules matching.
       * @module DefaultSampler
       * @function shouldSample
       */
      shouldSample: function shouldSample(sampleRequest) {
        try {
          if (!this.started) {
            this.start();
          }
          if (!sampleRequest.serviceType) {
            sampleRequest.serviceType = SegmentUtils.origin;
          }
          var now = Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3);
          var matchedRule = this.ruleCache.getMatchedRule(sampleRequest, now);
          if (matchedRule) {
            logger.getLogger().debug(util.format("Rule %s is matched.", matchedRule.getName()));
            return processMatchedRule(matchedRule, now);
          } else {
            logger.getLogger().info("No effective centralized sampling rule match. Fallback to local rules.");
            return this.localSampler.shouldSample(sampleRequest);
          }
        } catch (err) {
          logger.getLogger().error("Unhandled exception by the SDK during making sampling decisions: " + err);
        }
      },
      /**
       * Set local rules in case there is a need to fallback.
       * @module DefaultSampler
       * @function setLocalRules
       */
      setLocalRules: function setLocalRules(source) {
        this.localSampler.setLocalRules(source);
      },
      /**
       * Start the pollers to poll sampling rules and targets from X-Ray service.
       * @module DefaultSampler
       * @function start
       */
      start: function start() {
        if (!this.started) {
          this.rulePoller.start();
          this.targetPoller.start();
          this.started = true;
        }
      }
    };
    var processMatchedRule = function processMatchedRule2(rule, now) {
      rule.incrementRequestCount();
      var reservoir = rule.getReservoir();
      var sample = true;
      var decision = reservoir.borrowOrTake(now, rule.canBorrow());
      if (decision === "borrow") {
        rule.incrementBorrowCount();
      } else if (decision === "take") {
        rule.incrementSampledCount();
      } else if (Math.random() <= rule.getRate()) {
        rule.incrementSampledCount();
      } else {
        sample = false;
      }
      if (sample) {
        return rule.getName();
      } else {
        return false;
      }
    };
    module2.exports = DefaultSampler;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/middleware/mw_utils.js
var require_mw_utils = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/middleware/mw_utils.js"(exports2, module2) {
    "use strict";
    var Segment = require_segment();
    var IncomingRequestData = require_incoming_request_data();
    var logger = require_logger();
    var coreUtils = require_utils();
    var wildcardMatch = require_utils().wildcardMatch;
    var processTraceData = require_utils().processTraceData;
    var XRAY_HEADER = "x-amzn-trace-id";
    var overrideFlag = !!process.env.AWS_XRAY_TRACING_NAME;
    var utils = {
      defaultName: process.env.AWS_XRAY_TRACING_NAME,
      dynamicNaming: false,
      hostPattern: null,
      sampler: require_default_sampler(),
      /**
       * Enables dynamic naming for segments via the middleware. Use 'AWSXRay.middleware.enableDynamicNaming()'.
       * @param {string} [hostPattern] - The pattern to match the host header. See the README on dynamic and fixed naming modes.
       * @alias module:mw_utils.enableDynamicNaming
       */
      enableDynamicNaming: function(hostPattern) {
        this.dynamicNaming = true;
        if (hostPattern && typeof hostPattern !== "string") {
          throw new Error("Host pattern must be a string.");
        }
        this.hostPattern = hostPattern || null;
      },
      /**
       * Splits out the 'x-amzn-trace-id' header params from the incoming request.  Used by the middleware.
       * @param {http.IncomingMessage|https.IncomingMessage} req - The request object from the incoming call.
       * @returns {object}
       * @alias module:mw_utils.processHeaders
       */
      processHeaders: function processHeaders(req) {
        var amznTraceHeader = {};
        if (req && req.headers && req.headers[XRAY_HEADER]) {
          amznTraceHeader = processTraceData(req.headers[XRAY_HEADER]);
        }
        return amznTraceHeader;
      },
      /**
       * Resolves the name of the segment as determined by fixed or dynamic mode options. Used by the middleware.
       * @param {string} hostHeader - The string from the request.headers.host property.
       * @returns {string}
       * @alias module:mw_utils.resolveName
       */
      resolveName: function resolveName(hostHeader) {
        var name;
        if (this.dynamicNaming && hostHeader) {
          name = this.hostPattern ? wildcardMatch(this.hostPattern, hostHeader) ? hostHeader : this.defaultName : hostHeader;
        } else {
          name = this.defaultName;
        }
        return name;
      },
      /**
       * Resolves the sampling decision as determined by the values given and options set. Used by the middleware.
       * @param {object} amznTraceHeader - The object as returned by the processHeaders function.
       * @param {Segment} segment - The string from the request.headers.host property.
       * @param {http.ServerResponse|https.ServerResponse} res - The response object from the incoming call.
       * @returns {boolean}
       * @alias module:mw_utils.resolveSampling
       */
      resolveSampling: function resolveSampling(amznTraceHeader, segment, res) {
        var isSampled;
        if (amznTraceHeader.sampled === "1") {
          isSampled = true;
        } else if (amznTraceHeader.sampled === "0") {
          isSampled = false;
        } else {
          var sampleRequest = {
            host: res.req.headers.host,
            httpMethod: res.req.method,
            urlPath: res.req.url,
            serviceName: segment.name
          };
          isSampled = this.sampler.shouldSample(sampleRequest);
          if (isSampled instanceof String || typeof isSampled === "string") {
            segment.setMatchedSamplingRule(isSampled);
            isSampled = true;
          }
        }
        if (amznTraceHeader.sampled === "?") {
          res.header[XRAY_HEADER] = "Root=" + amznTraceHeader.root + ";Sampled=" + (isSampled ? "1" : "0");
        }
        if (!isSampled) {
          segment.notTraced = true;
        }
      },
      /**
       * Sets the default name of created segments. Used with the middleware.
       * Can be overridden by the AWS_XRAY_TRACING_NAME environment variable.
       * @param {string} name - The default name for segments created in the middleware.
       * @alias module:mw_utils.setDefaultName
       */
      setDefaultName: function setDefaultName(name) {
        if (!overrideFlag) {
          this.defaultName = name;
        }
      },
      disableCentralizedSampling: function disableCentralizedSampling() {
        this.sampler = require_local_sampler();
      },
      /**
       * Overrides the default sampling rules file to specify at what rate to sample at for specific routes.
       * The base sampling rules file can be found at /lib/resources/default_sampling_rules.json
       * @param {string|Object} source - The path to the custom sampling rules file, or the source JSON object.
       * @memberof AWSXRay
       */
      setSamplingRules: function setSamplingRules(source) {
        if (!source || source instanceof String || !(typeof source === "string" || source instanceof Object)) {
          throw new Error("Please specify a path to the local sampling rules file, or supply an object containing the rules.");
        }
        this.sampler.setLocalRules(source);
      },
      /**
       * Logs a debug message including core request and segment information
       * @param {string} message - The message to be logged
       * @param {string} url - The request url being traced
       * @param {Segment} - The current segment
       */
      middlewareLog: function middlewareLog(message, url, segment) {
        logger.getLogger().debug(message + ": { url: " + url + ", name: " + segment.name + ", trace_id: " + segment.trace_id + ", id: " + segment.id + ", sampled: " + !segment.notTraced + " }");
      },
      /**
       * Traces the request/response cycle of an http.IncomingMessage / http.ServerResponse pair.
       * Resolves sampling rules, creates a segment, adds the core request / response data adding
       * throttling / error / fault flags based on the response status code.
       * @param {http.IncomingMessage} req - The incoming request.
       * @param {http.ServerResponse} res - The server response.
       * @returns {Segment}
       * @memberof AWSXRay
       */
      traceRequestResponseCycle: function traceRequestResponseCycle(req, res) {
        var amznTraceHeader = this.processHeaders(req);
        var name = this.resolveName(req.headers.host);
        var segment = new Segment(name, amznTraceHeader.root, amznTraceHeader.parent);
        var responseWithEmbeddedRequest = Object.assign({}, res, { req });
        this.resolveSampling(amznTraceHeader, segment, responseWithEmbeddedRequest);
        segment.addIncomingRequestData(new IncomingRequestData(req));
        this.middlewareLog("Starting middleware segment", req.url, segment);
        var middlewareLog = this.middlewareLog;
        var didEnd = false;
        var endSegment = function() {
          if (didEnd) {
            return;
          }
          didEnd = true;
          if (res.statusCode === 429) {
            segment.addThrottleFlag();
          }
          const cause = coreUtils.getCauseTypeFromHttpStatus(res.statusCode);
          if (cause) {
            segment[cause] = true;
          }
          segment.http.close(res);
          segment.close();
          middlewareLog("Closed middleware segment successfully", req.url, segment);
        };
        res.on("finish", endSegment);
        res.on("close", endSegment);
        return segment;
      }
    };
    module2.exports = utils;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/env/aws_lambda.js
var require_aws_lambda = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/env/aws_lambda.js"(exports2, module2) {
    "use strict";
    var contextUtils = require_context_utils();
    var mwUtils = require_mw_utils();
    var LambdaUtils = require_utils().LambdaUtils;
    var Segment = require_segment();
    var SegmentEmitter = require_segment_emitter();
    var SegmentUtils = require_segment_utils();
    var logger = require_logger();
    var TraceID = require_trace_id();
    var xAmznTraceIdPrev = null;
    module2.exports.init = function init() {
      contextUtils.enableManualMode = function() {
        logger.getLogger().warn("AWS Lambda does not support AWS X-Ray manual mode.");
      };
      SegmentEmitter.disableReusableSocket();
      SegmentUtils.setStreamingThreshold(0);
      logger.getLogger().info("Disabling centralized sampling in Lambda environment.");
      mwUtils.disableCentralizedSampling();
      var namespace = contextUtils.getNamespace();
      namespace.enter(namespace.createContext());
      contextUtils.setSegment(facadeSegment());
    };
    var facadeSegment = function facadeSegment2() {
      var segment = new Segment("facade");
      var whitelistFcn = ["addNewSubsegment", "addSubsegment", "removeSubsegment", "toString", "addSubsegmentWithoutSampling", "addNewSubsegmentWithoutSampling"];
      var silentFcn = ["incrementCounter", "decrementCounter", "isClosed", "close", "format", "flush"];
      var xAmznTraceId = process.env._X_AMZN_TRACE_ID;
      for (var key in segment) {
        if (typeof segment[key] === "function" && whitelistFcn.indexOf(key) === -1) {
          if (silentFcn.indexOf(key) === -1) {
            segment[key] = /* @__PURE__ */ function() {
              var func = key;
              return function facade() {
                logger.getLogger().warn('Function "' + func + '" cannot be called on an AWS Lambda segment. Please use a subsegment to record data.');
                return;
              };
            }();
          } else {
            segment[key] = function facade() {
              return;
            };
          }
        }
      }
      segment.trace_id = TraceID.Invalid().toString();
      segment.isClosed = function() {
        return true;
      };
      segment.in_progress = false;
      segment.counter = 1;
      segment.notTraced = true;
      segment.facade = true;
      segment.reset = function reset() {
        this.trace_id = TraceID.Invalid().toString();
        this.id = "00000000";
        delete this.subsegments;
        this.notTraced = true;
      };
      segment.resolveLambdaTraceData = function resolveLambdaTraceData() {
        var xAmznLambda = process.env._X_AMZN_TRACE_ID;
        if (xAmznLambda) {
          if (xAmznLambda != xAmznTraceIdPrev) {
            this.reset();
            if (LambdaUtils.populateTraceData(segment, xAmznLambda)) {
              xAmznTraceIdPrev = xAmznLambda;
            }
          }
        } else {
          this.reset();
          contextUtils.contextMissingStrategy.contextMissing("Missing AWS Lambda trace data for X-Ray. Ensure Active Tracing is enabled and no subsegments are created outside the function handler.");
        }
      };
      if (LambdaUtils.validTraceData(xAmznTraceId)) {
        if (LambdaUtils.populateTraceData(segment, xAmznTraceId)) {
          xAmznTraceIdPrev = xAmznTraceId;
        }
      }
      return segment;
    };
  }
});

// node_modules/aws-xray-sdk-core/package.json
var require_package = __commonJS({
  "node_modules/aws-xray-sdk-core/package.json"(exports2, module2) {
    module2.exports = {
      name: "aws-xray-sdk-core",
      version: "3.5.4",
      description: "AWS X-Ray SDK for Javascript",
      author: "Amazon Web Services",
      contributors: [
        "Sandra McMullen <mcmuls@amazon.com>",
        "William Armiros <armiros@amazon.com>",
        "Moritz Onken <onken@netcubed.de>"
      ],
      files: [
        "dist/lib/**/*",
        "LICENSE",
        "README.md"
      ],
      main: "dist/lib/index.js",
      types: "dist/lib/index.d.ts",
      engines: {
        node: ">= 14.x"
      },
      directories: {
        test: "test"
      },
      "//": "@types/cls-hooked is exposed in API so must be in dependencies, not devDependencies",
      dependencies: {
        "@aws-sdk/types": "^3.4.1",
        "@smithy/service-error-classification": "^2.0.4",
        "@types/cls-hooked": "^4.3.3",
        "atomic-batcher": "^1.0.2",
        "cls-hooked": "^4.2.2",
        semver: "^7.5.3"
      },
      scripts: {
        prepare: "npm run compile",
        compile: "tsc && npm run copy-lib && npm run copy-test",
        "copy-lib": "find lib -type f \\( -name '*.d.ts' -o -name '*.json' \\) | xargs -I % ../../scripts/cp-with-structure.sh % dist",
        "copy-test": "find test -name '*.json' | xargs -I % ../../scripts/cp-with-structure.sh % dist",
        lint: "eslint .",
        "lint:fix": "eslint . --fix",
        test: "npm run compile && mocha --recursive ./dist/test/ -R spec && tsd && mocha --recursive ./dist/test_async/ -R spec",
        "test-d": "tsd",
        "test-async": "npm run compile && mocha --recursive ./dist/test_async/ -R spec",
        clean: "rm -rf dist && rm -rf node_modules",
        testcov: "nyc npm run test",
        reportcov: "nyc report --reporter=text-lcov > coverage.lcov && codecov"
      },
      keywords: [
        "amazon",
        "api",
        "aws",
        "core",
        "xray",
        "x-ray",
        "x ray"
      ],
      license: "Apache-2.0",
      repository: "https://github.com/aws/aws-xray-sdk-node/tree/master/packages/core",
      gitHead: "7a5e907ee66a2e197679d8e60108a5c1e9d5f5c9"
    };
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/plugin.js
var require_plugin = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/plugin.js"(exports2, module2) {
    "use strict";
    var http = require("http");
    var Plugin = {
      METADATA_TIMEOUT: 1e3,
      /**
       * Asynchronously retrieves metadata from on-instance endpoint with an HTTP request using retries for
       * requests that time out.
       * @param {object} options - The HTTP options to make the request with
       * @param {function} callback - callback to plugin
       */
      getPluginMetadata: function(options, callback) {
        const METADATA_RETRY_TIMEOUT = 250;
        const METADATA_RETRIES = 5;
        var retries = METADATA_RETRIES;
        var getMetadata = function() {
          var httpReq = http.__request ? http.__request : http.request;
          var req = httpReq(options, function(res) {
            var body = "";
            res.on("data", function(chunk) {
              body += chunk;
            });
            res.on("end", function() {
              if (this.statusCode === 200 || this.statusCode === 300) {
                try {
                  body = JSON.parse(body);
                } catch (e) {
                  callback(e);
                  return;
                }
                callback(null, body);
              } else if (retries > 0 && Math.floor(this.statusCode / 100) === 5) {
                retries--;
                setTimeout(getMetadata, METADATA_RETRY_TIMEOUT);
              } else {
                callback(new Error(`Failed to retrieve metadata with options: ${options}`));
              }
            });
          });
          req.on("error", function(err) {
            callback(err);
          });
          req.on("timeout", function() {
            req.abort();
          });
          req.setTimeout(Plugin.METADATA_TIMEOUT);
          req.end();
        };
        getMetadata();
      }
    };
    module2.exports = Plugin;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/ec2_plugin.js
var require_ec2_plugin = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/ec2_plugin.js"(exports2, module2) {
    "use strict";
    var Plugin = require_plugin();
    var logger = require_logger();
    var http = require("http");
    var EC2Plugin = {
      /**
       * A function to get the instance data from the EC2 metadata service.
       * @param {function} callback - The callback for the plugin loader.
       */
      getData: function(callback) {
        const METADATA_PATH = "/latest/dynamic/instance-identity/document";
        function populateMetadata(token) {
          const options = getOptions(METADATA_PATH, "GET", token ? { "X-aws-ec2-metadata-token": token } : {});
          Plugin.getPluginMetadata(options, function(err, data) {
            if (err || !data) {
              logger.getLogger().error("Error loading EC2 plugin metadata: ", err ? err.toString() : "Could not retrieve data from IMDS.");
              callback();
              return;
            }
            const metadata = {
              ec2: {
                instance_id: data.instanceId,
                availability_zone: data.availabilityZone,
                instance_size: data.instanceType,
                ami_id: data.imageId
              }
            };
            callback(metadata);
          });
        }
        getToken(function(token) {
          if (token === null) {
            logger.getLogger().debug("EC2Plugin failed to get token from IMDSv2. Falling back to IMDSv1.");
          }
          populateMetadata(token);
        });
      },
      originName: "AWS::EC2::Instance"
    };
    function getToken(callback) {
      const httpReq = http.__request ? http.__request : http.request;
      const TTL = 60;
      const TOKEN_PATH = "/latest/api/token";
      const options = getOptions(TOKEN_PATH, "PUT", {
        "X-aws-ec2-metadata-token-ttl-seconds": TTL
      });
      let req = httpReq(options, function(res) {
        let body = "";
        res.on("data", function(chunk) {
          body += chunk;
        });
        res.on("end", function() {
          if (this.statusCode === 200 || this.statusCode === 300) {
            callback(body);
          } else {
            callback(null);
          }
        });
      });
      req.on("error", function() {
        callback(null);
      });
      req.on("timeout", function() {
        req.abort();
        callback(null);
      });
      req.setTimeout(Plugin.METADATA_TIMEOUT);
      req.end();
    }
    function getOptions(path, method, headers) {
      if (!method) {
        method = "GET";
      }
      if (!headers) {
        headers = {};
      }
      return {
        host: "169.254.169.254",
        path,
        method,
        headers
      };
    }
    module2.exports = EC2Plugin;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/ecs_plugin.js
var require_ecs_plugin = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/ecs_plugin.js"(exports2, module2) {
    "use strict";
    var os = require("os");
    var ECSPlugin = {
      /**
       * A function to get the instance data from the ECS instance.
       * @param {function} callback - The callback for the plugin loader.
       */
      getData: function(callback) {
        callback({ ecs: { container: os.hostname() } });
      },
      originName: "AWS::ECS::Container"
    };
    module2.exports = ECSPlugin;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/elastic_beanstalk_plugin.js
var require_elastic_beanstalk_plugin = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/plugins/elastic_beanstalk_plugin.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var logger = require_logger();
    var ENV_CONFIG_LOCATION = "/var/elasticbeanstalk/xray/environment.conf";
    var ElasticBeanstalkPlugin = {
      /**
       * A function to get data from the Elastic Beanstalk environment configuration file.
       * @param {function} callback - The callback for the plugin loader.
       */
      getData: function(callback) {
        fs.readFile(ENV_CONFIG_LOCATION, "utf8", function(err, rawData) {
          if (err) {
            logger.getLogger().error("Error loading Elastic Beanstalk plugin:", err.stack);
            callback();
          } else {
            var data = JSON.parse(rawData);
            var metadata = {
              elastic_beanstalk: {
                environment: data.environment_name,
                version_label: data.version_label,
                deployment_id: data.deployment_id
              }
            };
            callback(metadata);
          }
        });
      },
      originName: "AWS::ElasticBeanstalk::Environment"
    };
    module2.exports = ElasticBeanstalkPlugin;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/resources/aws_whitelist.json
var require_aws_whitelist = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/resources/aws_whitelist.json"(exports2, module2) {
    module2.exports = {
      services: {
        dynamodb: {
          operations: {
            batchGetItem: {
              request_descriptors: {
                RequestItems: {
                  get_keys: true,
                  rename_to: "table_names"
                }
              },
              response_parameters: [
                "ConsumedCapacity"
              ]
            },
            batchWriteItem: {
              request_descriptors: {
                RequestItems: {
                  get_keys: true,
                  rename_to: "table_names"
                }
              },
              response_parameters: [
                "ConsumedCapacity",
                "ItemCollectionMetrics"
              ]
            },
            createTable: {
              request_parameters: [
                "GlobalSecondaryIndexes",
                "LocalSecondaryIndexes",
                "ProvisionedThroughput",
                "TableName"
              ]
            },
            deleteItem: {
              request_parameters: [
                "TableName"
              ],
              response_parameters: [
                "ConsumedCapacity",
                "ItemCollectionMetrics"
              ]
            },
            deleteTable: {
              request_parameters: [
                "TableName"
              ]
            },
            describeTable: {
              request_parameters: [
                "TableName"
              ]
            },
            getItem: {
              request_parameters: [
                "ConsistentRead",
                "ProjectionExpression",
                "TableName"
              ],
              response_parameters: [
                "ConsumedCapacity"
              ]
            },
            listTables: {
              request_parameters: [
                "ExclusiveStartTableName",
                "Limit"
              ],
              response_descriptors: {
                TableNames: {
                  list: true,
                  get_count: true,
                  rename_to: "table_count"
                }
              }
            },
            putItem: {
              request_parameters: [
                "TableName"
              ],
              response_parameters: [
                "ConsumedCapacity",
                "ItemCollectionMetrics"
              ]
            },
            query: {
              request_parameters: [
                "AttributesToGet",
                "ConsistentRead",
                "IndexName",
                "Limit",
                "ProjectionExpression",
                "ScanIndexForward",
                "Select",
                "TableName"
              ],
              response_parameters: [
                "ConsumedCapacity"
              ]
            },
            scan: {
              request_parameters: [
                "AttributesToGet",
                "ConsistentRead",
                "IndexName",
                "Limit",
                "ProjectionExpression",
                "Segment",
                "Select",
                "TableName",
                "TotalSegments"
              ],
              response_parameters: [
                "ConsumedCapacity",
                "Count",
                "ScannedCount"
              ]
            },
            updateItem: {
              request_parameters: [
                "TableName"
              ],
              response_parameters: [
                "ConsumedCapacity",
                "ItemCollectionMetrics"
              ]
            },
            updateTable: {
              request_parameters: [
                "AttributeDefinitions",
                "GlobalSecondaryIndexUpdates",
                "ProvisionedThroughput",
                "TableName"
              ]
            }
          }
        },
        sqs: {
          operations: {
            addPermission: {
              request_parameters: [
                "Label",
                "QueueUrl"
              ]
            },
            changeMessageVisibility: {
              request_parameters: [
                "QueueUrl",
                "VisibilityTimeout"
              ]
            },
            changeMessageVisibilityBatch: {
              request_parameters: [
                "QueueUrl"
              ],
              response_parameters: [
                "Failed"
              ]
            },
            createQueue: {
              request_parameters: [
                "Attributes",
                "QueueName"
              ]
            },
            deleteMessage: {
              request_parameters: [
                "QueueUrl"
              ]
            },
            deleteMessageBatch: {
              request_parameters: [
                "QueueUrl"
              ],
              response_parameters: [
                "Failed"
              ]
            },
            deleteQueue: {
              request_parameters: [
                "QueueUrl"
              ]
            },
            getQueueAttributes: {
              request_parameters: [
                "QueueUrl"
              ],
              response_parameters: [
                "Attributes"
              ]
            },
            getQueueUrl: {
              request_parameters: [
                "QueueName",
                "QueueOwnerAWSAccountId"
              ],
              response_parameters: [
                "QueueUrl"
              ]
            },
            listDeadLetterSourceQueues: {
              request_parameters: [
                "QueueUrl"
              ],
              response_parameters: [
                "QueueUrls"
              ]
            },
            listQueues: {
              request_parameters: [
                "QueueNamePrefix"
              ],
              response_descriptors: {
                QueueUrls: {
                  list: true,
                  get_count: true,
                  rename_to: "queue_count"
                }
              }
            },
            purgeQueue: {
              request_parameters: [
                "QueueUrl"
              ]
            },
            receiveMessage: {
              request_parameters: [
                "AttributeNames",
                "MaxNumberOfMessages",
                "MessageAttributeNames",
                "QueueUrl",
                "VisibilityTimeout",
                "WaitTimeSeconds"
              ],
              response_descriptors: {
                Messages: {
                  list: true,
                  get_count: true,
                  rename_to: "message_count"
                }
              }
            },
            removePermission: {
              request_parameters: [
                "QueueUrl"
              ]
            },
            sendMessage: {
              request_parameters: [
                "DelaySeconds",
                "QueueUrl"
              ],
              request_descriptors: {
                MessageAttributes: {
                  get_keys: true,
                  rename_to: "message_attribute_names"
                }
              },
              response_parameters: [
                "MessageId"
              ]
            },
            sendMessageBatch: {
              request_parameters: [
                "QueueUrl"
              ],
              request_descriptors: {
                Entries: {
                  list: true,
                  get_count: true,
                  rename_to: "message_count"
                }
              },
              response_descriptors: {
                Failed: {
                  list: true,
                  get_count: true,
                  rename_to: "failed_count"
                },
                Successful: {
                  list: true,
                  get_count: true,
                  rename_to: "successful_count"
                }
              }
            },
            setQueueAttributes: {
              request_parameters: [
                "QueueUrl"
              ],
              request_descriptors: {
                Attributes: {
                  get_keys: true,
                  rename_to: "attribute_names"
                }
              }
            }
          }
        },
        sns: {
          operations: {
            publish: {
              request_parameters: [
                "TopicArn"
              ]
            },
            publishBatch: {
              request_parameters: [
                "TopicArn"
              ]
            }
          }
        },
        lambda: {
          operations: {
            invoke: {
              request_parameters: [
                "FunctionName",
                "InvocationType",
                "LogType",
                "Qualifier"
              ],
              response_parameters: [
                "FunctionError",
                "StatusCode"
              ]
            },
            invokeAsync: {
              request_parameters: [
                "FunctionName"
              ],
              response_parameters: [
                "Status"
              ]
            }
          }
        },
        s3: {
          operations: {
            abortMultipartUpload: {
              request_parameters: [
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            completeMultipartUpload: {
              request_parameters: [
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            copyObject: {
              request_parameters: [
                "CopySource",
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            createBucket: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            createMultipartUpload: {
              request_parameters: [
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucket: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketAnalyticsConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketCors: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketEncryption: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketInventoryConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketLifecycle: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketMetricsConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketPolicy: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketReplication: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketTagging: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteBucketWebsite: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteObject: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteObjectTagging: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            deleteObjects: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketAccelerateConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketAcl: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketAnalyticsConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketCors: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketEncryption: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketInventoryConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketLifecycle: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketLifecycleConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketLocation: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketLogging: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketMetricsConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketNotification: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketNotificationConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketPolicy: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketReplication: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketRequestPayment: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketTagging: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketVersioning: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getBucketWebsite: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getObject: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getObjectAcl: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getObjectTagging: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            getObjectTorrent: {
              request_parameters: [
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            headBucket: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            headObject: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listBucketAnalyticsConfigurations: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listBucketInventoryConfigurations: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listBucketMetricsConfigurations: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listMultipartUploads: {
              request_parameters: [
                "Prefix"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listObjectVersions: {
              request_parameters: [
                "Prefix"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listObjects: {
              request_parameters: [
                "Prefix"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listObjectsV2: {
              request_parameters: [
                "Prefix"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            listParts: {
              request_parameters: [
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketAccelerateConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketAcl: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketAnalyticsConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketCors: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketEncryption: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketInventoryConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketLifecycle: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketLifecycleConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketLogging: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketMetricsConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketNotification: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketNotificationConfiguration: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketPolicy: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketReplication: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketRequestPayment: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketTagging: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketVersioning: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putBucketWebsite: {
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putObject: {
              request_parameters: [
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putObjectAcl: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            putObjectTagging: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            restoreObject: {
              request_parameters: [
                "Key",
                "VersionId"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            uploadPart: {
              request_parameters: [
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            },
            uploadPartCopy: {
              request_parameters: [
                "CopySource",
                "Key"
              ],
              request_descriptors: {
                Bucket: {
                  rename_to: "bucket_name"
                }
              }
            }
          }
        },
        sagemakerruntime: {
          operations: {
            invokeEndpoint: {
              request_parameters: [
                "EndpointName"
              ]
            }
          }
        }
      }
    };
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/patchers/call_capturer.js
var require_call_capturer = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/patchers/call_capturer.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var logger = require_logger();
    var whitelist = require_aws_whitelist();
    var paramTypes = {
      REQ_DESC: "request_descriptors",
      REQ_PARAMS: "request_parameters",
      RES_DESC: "response_descriptors",
      RES_PARAMS: "response_parameters"
    };
    function CallCapturer(source) {
      this.init(source);
    }
    CallCapturer.prototype.init = function init(source) {
      if (source) {
        if (typeof source === "string") {
          logger.getLogger().info("Using custom AWS whitelist file: " + source);
          this.services = loadWhitelist(JSON.parse(fs.readFileSync(source, "utf8")));
        } else {
          logger.getLogger().info("Using custom AWS whitelist source.");
          this.services = loadWhitelist(source);
        }
      } else {
        this.services = whitelist.services;
      }
    };
    CallCapturer.prototype.append = function append(source) {
      var newServices = {};
      if (typeof source === "string") {
        logger.getLogger().info("Appending AWS whitelist with custom file: " + source);
        newServices = loadWhitelist(JSON.parse(fs.readFileSync(source, "utf8")));
      } else {
        logger.getLogger().info("Appending AWS whitelist with a custom source.");
        newServices = loadWhitelist(source);
      }
      for (var attribute in newServices) {
        this.services[attribute] = newServices[attribute];
      }
    };
    CallCapturer.prototype.capture = function capture(serviceName, response) {
      var operation = response.request.operation;
      var call = this.services[serviceName] !== void 0 ? this.services[serviceName].operations[operation] : null;
      if (call === null) {
        logger.getLogger().debug('Call "' + serviceName + "." + operation + '" is not whitelisted for additional data capturing. Ignoring.');
        return;
      }
      var dataCaptured = {};
      for (var paramType in call) {
        var params = call[paramType];
        if (paramType === paramTypes.REQ_PARAMS) {
          captureCallParams(params, response.request.params, dataCaptured);
        } else if (paramType === paramTypes.REQ_DESC) {
          captureDescriptors(params, response.request.params, dataCaptured);
        } else if (paramType === paramTypes.RES_PARAMS) {
          if (response.data) {
            captureCallParams(params, response.data, dataCaptured);
          }
        } else if (paramType === paramTypes.RES_DESC) {
          if (response.data) {
            captureDescriptors(params, response.data, dataCaptured);
          }
        } else {
          logger.getLogger().error('Unknown parameter type "' + paramType + '". Must be "request_descriptors", "response_descriptors", "request_parameters" or "response_parameters".');
        }
      }
      return dataCaptured;
    };
    function captureCallParams(params, call, data) {
      params.forEach(function(param) {
        if (typeof call[param] !== "undefined") {
          var formatted = toSnakeCase(param);
          this[formatted] = call[param];
        }
      }, data);
    }
    function captureDescriptors(descriptors, params, data) {
      for (var paramName in descriptors) {
        var attributes = descriptors[paramName];
        if (typeof params[paramName] !== "undefined") {
          var paramData;
          if (attributes.list && attributes.get_count) {
            paramData = params[paramName] ? params[paramName].length : 0;
          } else {
            paramData = attributes.get_keys === true ? Object.keys(params[paramName]) : params[paramName];
          }
          if (typeof attributes.rename_to === "string") {
            data[attributes.rename_to] = paramData;
          } else {
            var formatted = toSnakeCase(paramName);
            data[formatted] = paramData;
          }
        }
      }
    }
    function toSnakeCase(param) {
      if (param === "IPAddress") {
        return "ip_address";
      } else {
        return param.split(/(?=[A-Z])/).join("_").toLowerCase();
      }
    }
    function loadWhitelist(source) {
      var doc = source;
      if (doc.services === void 0) {
        throw new Error('Document formatting is incorrect. Expecting "services" param.');
      }
      return doc.services;
    }
    module2.exports = CallCapturer;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/aws.js
var require_aws = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/segments/attributes/aws.js"(exports2, module2) {
    "use strict";
    var CallCapturer = require_call_capturer();
    var capturer = new CallCapturer();
    function Aws(res, serviceName) {
      this.init(res, serviceName);
    }
    Aws.prototype.init = function init(res, serviceName) {
      this.operation = formatOperation(res.request.operation) || "";
      if (res && res.request && res.request.httpRequest && res.request.httpRequest.region) {
        this.region = res.request.httpRequest.region;
      }
      if (res && res.requestId) {
        this.request_id = res.requestId;
      }
      this.retries = res.retryCount || 0;
      if (res.extendedRequestId && serviceName && serviceName.toLowerCase() === "s3") {
        this.id_2 = res.extendedRequestId;
      }
      if (serviceName) {
        this.addData(capturer.capture(serviceName.toLowerCase(), res));
      }
    };
    Aws.prototype.addData = function addData(data) {
      for (var attribute in data) {
        this[attribute] = data[attribute];
      }
    };
    var setAWSWhitelist = function setAWSWhitelist2(source) {
      if (!source || source instanceof String || !(typeof source === "string" || source instanceof Object)) {
        throw new Error("Please specify a path to the local whitelist file, or supply a whitelist source object.");
      }
      capturer = new CallCapturer(source);
    };
    var appendAWSWhitelist = function appendAWSWhitelist2(source) {
      if (!source || source instanceof String || !(typeof source === "string" || source instanceof Object)) {
        throw new Error("Please specify a path to the local whitelist file, or supply a whitelist source object.");
      }
      capturer.append(source);
    };
    function formatOperation(operation) {
      if (!operation) {
        return;
      }
      return operation.charAt(0).toUpperCase() + operation.slice(1);
    }
    module2.exports = Aws;
    module2.exports.appendAWSWhitelist = appendAWSWhitelist;
    module2.exports.setAWSWhitelist = setAWSWhitelist;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/capture.js
var require_capture = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/capture.js"(exports2, module2) {
    "use strict";
    var contextUtils = require_context_utils();
    var logger = require_logger();
    var captureFunc = function captureFunc2(name, fcn, parent) {
      validate(name, fcn);
      var current, executeFcn;
      var parentSeg = contextUtils.resolveSegment(parent);
      if (!parentSeg) {
        logger.getLogger().warn("Failed to capture function.");
        return fcn();
      }
      current = parentSeg.addNewSubsegment(name);
      executeFcn = captureFcn(fcn, current);
      try {
        const response = executeFcn(current);
        current.close();
        return response;
      } catch (e) {
        current.close(e);
        throw e;
      }
    };
    var captureAsyncFunc = function captureAsyncFunc2(name, fcn, parent) {
      validate(name, fcn);
      var current, executeFcn;
      var parentSeg = contextUtils.resolveSegment(parent);
      if (!parentSeg) {
        logger.getLogger().warn("Failed to capture async function.");
        return fcn();
      }
      current = parentSeg.addNewSubsegment(name);
      executeFcn = captureFcn(fcn, current);
      try {
        return executeFcn(current);
      } catch (e) {
        current.close(e);
        throw e;
      }
    };
    var captureCallbackFunc = function captureCallbackFunc2(name, fcn, parent) {
      validate(name, fcn);
      var base = contextUtils.resolveSegment(parent);
      if (!base) {
        logger.getLogger().warn("Failed to capture callback function.");
        return fcn;
      }
      base.incrementCounter();
      return function() {
        var parentSeg = contextUtils.resolveSegment(parent);
        var args = Array.prototype.slice.call(arguments);
        captureFunc(name, fcn.bind.apply(fcn, [null].concat(args)), parentSeg);
        base.decrementCounter();
      }.bind(this);
    };
    function captureFcn(fcn, current) {
      var executeFcn;
      if (contextUtils.isAutomaticMode()) {
        var session = contextUtils.getNamespace();
        var contextFcn = function() {
          var value;
          session.run(function() {
            contextUtils.setSegment(current);
            value = fcn(current);
          });
          return value;
        };
        executeFcn = contextFcn;
      } else {
        executeFcn = fcn;
      }
      return executeFcn;
    }
    function validate(name, fcn) {
      var error;
      if (!name || typeof name !== "string") {
        error = 'Param "name" must be a non-empty string.';
        logger.getLogger().error(error);
        throw new Error(error);
      } else if (typeof fcn !== "function") {
        error = 'Param "fcn" must be a function.';
        logger.getLogger().error(error);
        throw new Error(error);
      }
    }
    module2.exports.captureFunc = captureFunc;
    module2.exports.captureAsyncFunc = captureAsyncFunc;
    module2.exports.captureCallbackFunc = captureCallbackFunc;
  }
});

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module2.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports2 = module2.exports = {};
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var t = exports2.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NUMERICIDENTIFIER]}|${src[t.NONNUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NUMERICIDENTIFIERLOOSE]}|${src[t.NONNUMERICIDENTIFIER]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module2.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        return compareIdentifiers(this.major, other.major) || compareIdentifiers(this.minor, other.minor) || compareIdentifiers(this.patch, other.patch);
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (!identifier && identifierBase === false) {
              throw new Error("invalid increment argument: identifier is empty");
            }
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                if (isNaN(this.prerelease[1])) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module2.exports = parse;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module2.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module2.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (highVersion.patch) {
          return "patch";
        }
        if (highVersion.minor) {
          return "minor";
        }
        return "major";
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module2.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module2.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module2.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module2.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module2.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module2.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module2.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module2.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module2.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module2.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module2.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module2.exports = coerce;
  }
});

// node_modules/semver/node_modules/yallist/iterator.js
var require_iterator = __commonJS({
  "node_modules/semver/node_modules/yallist/iterator.js"(exports2, module2) {
    "use strict";
    module2.exports = function(Yallist) {
      Yallist.prototype[Symbol.iterator] = function* () {
        for (let walker = this.head; walker; walker = walker.next) {
          yield walker.value;
        }
      };
    };
  }
});

// node_modules/semver/node_modules/yallist/yallist.js
var require_yallist = __commonJS({
  "node_modules/semver/node_modules/yallist/yallist.js"(exports2, module2) {
    "use strict";
    module2.exports = Yallist;
    Yallist.Node = Node;
    Yallist.create = Yallist;
    function Yallist(list) {
      var self = this;
      if (!(self instanceof Yallist)) {
        self = new Yallist();
      }
      self.tail = null;
      self.head = null;
      self.length = 0;
      if (list && typeof list.forEach === "function") {
        list.forEach(function(item) {
          self.push(item);
        });
      } else if (arguments.length > 0) {
        for (var i = 0, l = arguments.length; i < l; i++) {
          self.push(arguments[i]);
        }
      }
      return self;
    }
    Yallist.prototype.removeNode = function(node) {
      if (node.list !== this) {
        throw new Error("removing node which does not belong to this list");
      }
      var next = node.next;
      var prev = node.prev;
      if (next) {
        next.prev = prev;
      }
      if (prev) {
        prev.next = next;
      }
      if (node === this.head) {
        this.head = next;
      }
      if (node === this.tail) {
        this.tail = prev;
      }
      node.list.length--;
      node.next = null;
      node.prev = null;
      node.list = null;
      return next;
    };
    Yallist.prototype.unshiftNode = function(node) {
      if (node === this.head) {
        return;
      }
      if (node.list) {
        node.list.removeNode(node);
      }
      var head = this.head;
      node.list = this;
      node.next = head;
      if (head) {
        head.prev = node;
      }
      this.head = node;
      if (!this.tail) {
        this.tail = node;
      }
      this.length++;
    };
    Yallist.prototype.pushNode = function(node) {
      if (node === this.tail) {
        return;
      }
      if (node.list) {
        node.list.removeNode(node);
      }
      var tail = this.tail;
      node.list = this;
      node.prev = tail;
      if (tail) {
        tail.next = node;
      }
      this.tail = node;
      if (!this.head) {
        this.head = node;
      }
      this.length++;
    };
    Yallist.prototype.push = function() {
      for (var i = 0, l = arguments.length; i < l; i++) {
        push(this, arguments[i]);
      }
      return this.length;
    };
    Yallist.prototype.unshift = function() {
      for (var i = 0, l = arguments.length; i < l; i++) {
        unshift(this, arguments[i]);
      }
      return this.length;
    };
    Yallist.prototype.pop = function() {
      if (!this.tail) {
        return void 0;
      }
      var res = this.tail.value;
      this.tail = this.tail.prev;
      if (this.tail) {
        this.tail.next = null;
      } else {
        this.head = null;
      }
      this.length--;
      return res;
    };
    Yallist.prototype.shift = function() {
      if (!this.head) {
        return void 0;
      }
      var res = this.head.value;
      this.head = this.head.next;
      if (this.head) {
        this.head.prev = null;
      } else {
        this.tail = null;
      }
      this.length--;
      return res;
    };
    Yallist.prototype.forEach = function(fn, thisp) {
      thisp = thisp || this;
      for (var walker = this.head, i = 0; walker !== null; i++) {
        fn.call(thisp, walker.value, i, this);
        walker = walker.next;
      }
    };
    Yallist.prototype.forEachReverse = function(fn, thisp) {
      thisp = thisp || this;
      for (var walker = this.tail, i = this.length - 1; walker !== null; i--) {
        fn.call(thisp, walker.value, i, this);
        walker = walker.prev;
      }
    };
    Yallist.prototype.get = function(n) {
      for (var i = 0, walker = this.head; walker !== null && i < n; i++) {
        walker = walker.next;
      }
      if (i === n && walker !== null) {
        return walker.value;
      }
    };
    Yallist.prototype.getReverse = function(n) {
      for (var i = 0, walker = this.tail; walker !== null && i < n; i++) {
        walker = walker.prev;
      }
      if (i === n && walker !== null) {
        return walker.value;
      }
    };
    Yallist.prototype.map = function(fn, thisp) {
      thisp = thisp || this;
      var res = new Yallist();
      for (var walker = this.head; walker !== null; ) {
        res.push(fn.call(thisp, walker.value, this));
        walker = walker.next;
      }
      return res;
    };
    Yallist.prototype.mapReverse = function(fn, thisp) {
      thisp = thisp || this;
      var res = new Yallist();
      for (var walker = this.tail; walker !== null; ) {
        res.push(fn.call(thisp, walker.value, this));
        walker = walker.prev;
      }
      return res;
    };
    Yallist.prototype.reduce = function(fn, initial) {
      var acc;
      var walker = this.head;
      if (arguments.length > 1) {
        acc = initial;
      } else if (this.head) {
        walker = this.head.next;
        acc = this.head.value;
      } else {
        throw new TypeError("Reduce of empty list with no initial value");
      }
      for (var i = 0; walker !== null; i++) {
        acc = fn(acc, walker.value, i);
        walker = walker.next;
      }
      return acc;
    };
    Yallist.prototype.reduceReverse = function(fn, initial) {
      var acc;
      var walker = this.tail;
      if (arguments.length > 1) {
        acc = initial;
      } else if (this.tail) {
        walker = this.tail.prev;
        acc = this.tail.value;
      } else {
        throw new TypeError("Reduce of empty list with no initial value");
      }
      for (var i = this.length - 1; walker !== null; i--) {
        acc = fn(acc, walker.value, i);
        walker = walker.prev;
      }
      return acc;
    };
    Yallist.prototype.toArray = function() {
      var arr = new Array(this.length);
      for (var i = 0, walker = this.head; walker !== null; i++) {
        arr[i] = walker.value;
        walker = walker.next;
      }
      return arr;
    };
    Yallist.prototype.toArrayReverse = function() {
      var arr = new Array(this.length);
      for (var i = 0, walker = this.tail; walker !== null; i++) {
        arr[i] = walker.value;
        walker = walker.prev;
      }
      return arr;
    };
    Yallist.prototype.slice = function(from, to) {
      to = to || this.length;
      if (to < 0) {
        to += this.length;
      }
      from = from || 0;
      if (from < 0) {
        from += this.length;
      }
      var ret = new Yallist();
      if (to < from || to < 0) {
        return ret;
      }
      if (from < 0) {
        from = 0;
      }
      if (to > this.length) {
        to = this.length;
      }
      for (var i = 0, walker = this.head; walker !== null && i < from; i++) {
        walker = walker.next;
      }
      for (; walker !== null && i < to; i++, walker = walker.next) {
        ret.push(walker.value);
      }
      return ret;
    };
    Yallist.prototype.sliceReverse = function(from, to) {
      to = to || this.length;
      if (to < 0) {
        to += this.length;
      }
      from = from || 0;
      if (from < 0) {
        from += this.length;
      }
      var ret = new Yallist();
      if (to < from || to < 0) {
        return ret;
      }
      if (from < 0) {
        from = 0;
      }
      if (to > this.length) {
        to = this.length;
      }
      for (var i = this.length, walker = this.tail; walker !== null && i > to; i--) {
        walker = walker.prev;
      }
      for (; walker !== null && i > from; i--, walker = walker.prev) {
        ret.push(walker.value);
      }
      return ret;
    };
    Yallist.prototype.splice = function(start, deleteCount, ...nodes) {
      if (start > this.length) {
        start = this.length - 1;
      }
      if (start < 0) {
        start = this.length + start;
      }
      for (var i = 0, walker = this.head; walker !== null && i < start; i++) {
        walker = walker.next;
      }
      var ret = [];
      for (var i = 0; walker && i < deleteCount; i++) {
        ret.push(walker.value);
        walker = this.removeNode(walker);
      }
      if (walker === null) {
        walker = this.tail;
      }
      if (walker !== this.head && walker !== this.tail) {
        walker = walker.prev;
      }
      for (var i = 0; i < nodes.length; i++) {
        walker = insert(this, walker, nodes[i]);
      }
      return ret;
    };
    Yallist.prototype.reverse = function() {
      var head = this.head;
      var tail = this.tail;
      for (var walker = head; walker !== null; walker = walker.prev) {
        var p = walker.prev;
        walker.prev = walker.next;
        walker.next = p;
      }
      this.head = tail;
      this.tail = head;
      return this;
    };
    function insert(self, node, value) {
      var inserted = node === self.head ? new Node(value, null, node, self) : new Node(value, node, node.next, self);
      if (inserted.next === null) {
        self.tail = inserted;
      }
      if (inserted.prev === null) {
        self.head = inserted;
      }
      self.length++;
      return inserted;
    }
    function push(self, item) {
      self.tail = new Node(item, self.tail, null, self);
      if (!self.head) {
        self.head = self.tail;
      }
      self.length++;
    }
    function unshift(self, item) {
      self.head = new Node(item, null, self.head, self);
      if (!self.tail) {
        self.tail = self.head;
      }
      self.length++;
    }
    function Node(value, prev, next, list) {
      if (!(this instanceof Node)) {
        return new Node(value, prev, next, list);
      }
      this.list = list;
      this.value = value;
      if (prev) {
        prev.next = this;
        this.prev = prev;
      } else {
        this.prev = null;
      }
      if (next) {
        next.prev = this;
        this.next = next;
      } else {
        this.next = null;
      }
    }
    try {
      require_iterator()(Yallist);
    } catch (er) {
    }
  }
});

// node_modules/semver/node_modules/lru-cache/index.js
var require_lru_cache = __commonJS({
  "node_modules/semver/node_modules/lru-cache/index.js"(exports2, module2) {
    "use strict";
    var Yallist = require_yallist();
    var MAX = Symbol("max");
    var LENGTH = Symbol("length");
    var LENGTH_CALCULATOR = Symbol("lengthCalculator");
    var ALLOW_STALE = Symbol("allowStale");
    var MAX_AGE = Symbol("maxAge");
    var DISPOSE = Symbol("dispose");
    var NO_DISPOSE_ON_SET = Symbol("noDisposeOnSet");
    var LRU_LIST = Symbol("lruList");
    var CACHE = Symbol("cache");
    var UPDATE_AGE_ON_GET = Symbol("updateAgeOnGet");
    var naiveLength = () => 1;
    var LRUCache = class {
      constructor(options) {
        if (typeof options === "number")
          options = { max: options };
        if (!options)
          options = {};
        if (options.max && (typeof options.max !== "number" || options.max < 0))
          throw new TypeError("max must be a non-negative number");
        const max = this[MAX] = options.max || Infinity;
        const lc = options.length || naiveLength;
        this[LENGTH_CALCULATOR] = typeof lc !== "function" ? naiveLength : lc;
        this[ALLOW_STALE] = options.stale || false;
        if (options.maxAge && typeof options.maxAge !== "number")
          throw new TypeError("maxAge must be a number");
        this[MAX_AGE] = options.maxAge || 0;
        this[DISPOSE] = options.dispose;
        this[NO_DISPOSE_ON_SET] = options.noDisposeOnSet || false;
        this[UPDATE_AGE_ON_GET] = options.updateAgeOnGet || false;
        this.reset();
      }
      // resize the cache when the max changes.
      set max(mL) {
        if (typeof mL !== "number" || mL < 0)
          throw new TypeError("max must be a non-negative number");
        this[MAX] = mL || Infinity;
        trim(this);
      }
      get max() {
        return this[MAX];
      }
      set allowStale(allowStale) {
        this[ALLOW_STALE] = !!allowStale;
      }
      get allowStale() {
        return this[ALLOW_STALE];
      }
      set maxAge(mA) {
        if (typeof mA !== "number")
          throw new TypeError("maxAge must be a non-negative number");
        this[MAX_AGE] = mA;
        trim(this);
      }
      get maxAge() {
        return this[MAX_AGE];
      }
      // resize the cache when the lengthCalculator changes.
      set lengthCalculator(lC) {
        if (typeof lC !== "function")
          lC = naiveLength;
        if (lC !== this[LENGTH_CALCULATOR]) {
          this[LENGTH_CALCULATOR] = lC;
          this[LENGTH] = 0;
          this[LRU_LIST].forEach((hit) => {
            hit.length = this[LENGTH_CALCULATOR](hit.value, hit.key);
            this[LENGTH] += hit.length;
          });
        }
        trim(this);
      }
      get lengthCalculator() {
        return this[LENGTH_CALCULATOR];
      }
      get length() {
        return this[LENGTH];
      }
      get itemCount() {
        return this[LRU_LIST].length;
      }
      rforEach(fn, thisp) {
        thisp = thisp || this;
        for (let walker = this[LRU_LIST].tail; walker !== null; ) {
          const prev = walker.prev;
          forEachStep(this, fn, walker, thisp);
          walker = prev;
        }
      }
      forEach(fn, thisp) {
        thisp = thisp || this;
        for (let walker = this[LRU_LIST].head; walker !== null; ) {
          const next = walker.next;
          forEachStep(this, fn, walker, thisp);
          walker = next;
        }
      }
      keys() {
        return this[LRU_LIST].toArray().map((k) => k.key);
      }
      values() {
        return this[LRU_LIST].toArray().map((k) => k.value);
      }
      reset() {
        if (this[DISPOSE] && this[LRU_LIST] && this[LRU_LIST].length) {
          this[LRU_LIST].forEach((hit) => this[DISPOSE](hit.key, hit.value));
        }
        this[CACHE] = /* @__PURE__ */ new Map();
        this[LRU_LIST] = new Yallist();
        this[LENGTH] = 0;
      }
      dump() {
        return this[LRU_LIST].map((hit) => isStale(this, hit) ? false : {
          k: hit.key,
          v: hit.value,
          e: hit.now + (hit.maxAge || 0)
        }).toArray().filter((h) => h);
      }
      dumpLru() {
        return this[LRU_LIST];
      }
      set(key, value, maxAge) {
        maxAge = maxAge || this[MAX_AGE];
        if (maxAge && typeof maxAge !== "number")
          throw new TypeError("maxAge must be a number");
        const now = maxAge ? Date.now() : 0;
        const len = this[LENGTH_CALCULATOR](value, key);
        if (this[CACHE].has(key)) {
          if (len > this[MAX]) {
            del(this, this[CACHE].get(key));
            return false;
          }
          const node = this[CACHE].get(key);
          const item = node.value;
          if (this[DISPOSE]) {
            if (!this[NO_DISPOSE_ON_SET])
              this[DISPOSE](key, item.value);
          }
          item.now = now;
          item.maxAge = maxAge;
          item.value = value;
          this[LENGTH] += len - item.length;
          item.length = len;
          this.get(key);
          trim(this);
          return true;
        }
        const hit = new Entry(key, value, len, now, maxAge);
        if (hit.length > this[MAX]) {
          if (this[DISPOSE])
            this[DISPOSE](key, value);
          return false;
        }
        this[LENGTH] += hit.length;
        this[LRU_LIST].unshift(hit);
        this[CACHE].set(key, this[LRU_LIST].head);
        trim(this);
        return true;
      }
      has(key) {
        if (!this[CACHE].has(key))
          return false;
        const hit = this[CACHE].get(key).value;
        return !isStale(this, hit);
      }
      get(key) {
        return get(this, key, true);
      }
      peek(key) {
        return get(this, key, false);
      }
      pop() {
        const node = this[LRU_LIST].tail;
        if (!node)
          return null;
        del(this, node);
        return node.value;
      }
      del(key) {
        del(this, this[CACHE].get(key));
      }
      load(arr) {
        this.reset();
        const now = Date.now();
        for (let l = arr.length - 1; l >= 0; l--) {
          const hit = arr[l];
          const expiresAt = hit.e || 0;
          if (expiresAt === 0)
            this.set(hit.k, hit.v);
          else {
            const maxAge = expiresAt - now;
            if (maxAge > 0) {
              this.set(hit.k, hit.v, maxAge);
            }
          }
        }
      }
      prune() {
        this[CACHE].forEach((value, key) => get(this, key, false));
      }
    };
    var get = (self, key, doUse) => {
      const node = self[CACHE].get(key);
      if (node) {
        const hit = node.value;
        if (isStale(self, hit)) {
          del(self, node);
          if (!self[ALLOW_STALE])
            return void 0;
        } else {
          if (doUse) {
            if (self[UPDATE_AGE_ON_GET])
              node.value.now = Date.now();
            self[LRU_LIST].unshiftNode(node);
          }
        }
        return hit.value;
      }
    };
    var isStale = (self, hit) => {
      if (!hit || !hit.maxAge && !self[MAX_AGE])
        return false;
      const diff = Date.now() - hit.now;
      return hit.maxAge ? diff > hit.maxAge : self[MAX_AGE] && diff > self[MAX_AGE];
    };
    var trim = (self) => {
      if (self[LENGTH] > self[MAX]) {
        for (let walker = self[LRU_LIST].tail; self[LENGTH] > self[MAX] && walker !== null; ) {
          const prev = walker.prev;
          del(self, walker);
          walker = prev;
        }
      }
    };
    var del = (self, node) => {
      if (node) {
        const hit = node.value;
        if (self[DISPOSE])
          self[DISPOSE](hit.key, hit.value);
        self[LENGTH] -= hit.length;
        self[CACHE].delete(hit.key);
        self[LRU_LIST].removeNode(node);
      }
    };
    var Entry = class {
      constructor(key, value, length, now, maxAge) {
        this.key = key;
        this.value = value;
        this.length = length;
        this.now = now;
        this.maxAge = maxAge || 0;
      }
    };
    var forEachStep = (self, fn, node, thisp) => {
      let hit = node.value;
      if (isStale(self, hit)) {
        del(self, node);
        if (!self[ALLOW_STALE])
          hit = void 0;
      }
      if (hit)
        fn.call(thisp, hit.value, hit.key, self);
    };
    module2.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.format();
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().split(/\s+/).join(" ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.format();
      }
      format() {
        this.range = this.set.map((comps) => comps.join(" ").trim()).join("||").trim();
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lru_cache();
    var cache = new LRU({ max: 1e3 });
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr, tb) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module2.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module2.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module2.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module2.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module2.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module2.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER:
        for (const simpleSub of sub.set) {
          for (const simpleDom of dom.set) {
            const isSub = simpleSubset(simpleSub, simpleDom, options);
            sawNonNull = sawNonNull || isSub !== null;
            if (isSub) {
              continue OUTER;
            }
          }
          if (sawNonNull) {
            return false;
          }
        }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module2.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/patchers/aws_p.js
var require_aws_p = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/patchers/aws_p.js"(exports2, module2) {
    "use strict";
    var semver = require_semver2();
    var Aws = require_aws();
    var contextUtils = require_context_utils();
    var Utils = require_utils();
    var logger = require_logger();
    var minVersion = "2.7.15";
    var throttledErrorDefault = function throttledErrorDefault2() {
      return false;
    };
    var captureAWS2 = function captureAWS3(awssdk) {
      if (!semver.gte(awssdk.VERSION, minVersion)) {
        throw new Error("AWS SDK version " + minVersion + " or greater required.");
      }
      for (var prop in awssdk) {
        if (awssdk[prop].serviceIdentifier) {
          var Service = awssdk[prop];
          Service.prototype.customizeRequests(captureAWSRequest);
        }
      }
      return awssdk;
    };
    var captureAWSClient = function captureAWSClient2(service) {
      service.customizeRequests(captureAWSRequest);
      return service;
    };
    function captureAWSRequest(req) {
      var parent = contextUtils.resolveSegment(contextUtils.resolveManualSegmentParams(req.params));
      if (!parent) {
        var output = this.serviceIdentifier + "." + req.operation;
        if (!contextUtils.isAutomaticMode()) {
          logger.getLogger().info("Call " + output + ' requires a segment object on the request params as "XRaySegment" for tracing in manual mode. Ignoring.');
        } else {
          logger.getLogger().info("Call " + output + " is missing the sub/segment context for automatic mode. Ignoring.");
        }
        return req;
      }
      var throttledError = this.throttledError || throttledErrorDefault;
      var stack = new Error().stack;
      let subsegment;
      if (parent.notTraced) {
        subsegment = parent.addNewSubsegmentWithoutSampling(this.serviceIdentifier);
      } else {
        subsegment = parent.addNewSubsegment(this.serviceIdentifier);
      }
      var traceId = parent.segment ? parent.segment.trace_id : parent.trace_id;
      const data = parent.segment ? parent.segment.additionalTraceData : parent.additionalTraceData;
      var buildListener = function(req2) {
        let traceHeader = "Root=" + traceId + ";Parent=" + subsegment.id + ";Sampled=" + (subsegment.notTraced ? "0" : "1");
        if (data != null) {
          for (const [key, value] of Object.entries(data)) {
            traceHeader += ";" + key + "=" + value;
          }
        }
        req2.httpRequest.headers["X-Amzn-Trace-Id"] = traceHeader;
      };
      var completeListener = function(res) {
        subsegment.addAttribute("namespace", "aws");
        subsegment.addAttribute("aws", new Aws(res, subsegment.name));
        var httpRes = res.httpResponse;
        if (httpRes) {
          subsegment.addAttribute("http", new HttpResponse(httpRes));
          if (httpRes.statusCode === 429 || res.error && throttledError(res.error)) {
            subsegment.addThrottleFlag();
          }
        }
        if (res.error) {
          var err = { message: res.error.message, name: res.error.code, stack };
          if (httpRes && httpRes.statusCode) {
            if (Utils.getCauseTypeFromHttpStatus(httpRes.statusCode) == "error") {
              subsegment.addErrorFlag();
            }
            subsegment.close(err, true);
          } else {
            subsegment.close(err);
          }
        } else {
          if (httpRes && httpRes.statusCode) {
            var cause = Utils.getCauseTypeFromHttpStatus(httpRes.statusCode);
            if (cause) {
              subsegment[cause] = true;
            }
          }
          subsegment.close();
        }
      };
      req.on("beforePresign", function(req2) {
        parent.removeSubsegment(subsegment);
        parent.decrementCounter();
        req2.removeListener("build", buildListener);
        req2.removeListener("complete", completeListener);
      });
      req.on("build", buildListener).on("complete", completeListener);
      if (!req.__send) {
        req.__send = req.send;
        req.send = function(callback) {
          if (contextUtils.isAutomaticMode()) {
            var session = contextUtils.getNamespace();
            session.run(function() {
              contextUtils.setSegment(subsegment);
              req.__send(callback);
            });
          } else {
            req.__send(callback);
          }
        };
      }
    }
    function HttpResponse(res) {
      this.init(res);
    }
    HttpResponse.prototype.init = function init(res) {
      this.response = {
        status: res.statusCode || ""
      };
      if (res.headers && res.headers["content-length"]) {
        this.response.content_length = res.headers["content-length"];
      }
    };
    module2.exports.captureAWSClient = captureAWSClient;
    module2.exports.captureAWS = captureAWS2;
  }
});

// node_modules/@smithy/service-error-classification/dist-cjs/index.js
var require_dist_cjs = __commonJS({
  "node_modules/@smithy/service-error-classification/dist-cjs/index.js"(exports2, module2) {
    "use strict";
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
    var __export2 = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS2 = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var src_exports = {};
    __export2(src_exports, {
      isClockSkewError: () => isClockSkewError,
      isRetryableByTrait: () => isRetryableByTrait,
      isServerError: () => isServerError,
      isThrottlingError: () => isThrottlingError,
      isTransientError: () => isTransientError
    });
    module2.exports = __toCommonJS2(src_exports);
    var CLOCK_SKEW_ERROR_CODES = [
      "AuthFailure",
      "InvalidSignatureException",
      "RequestExpired",
      "RequestInTheFuture",
      "RequestTimeTooSkewed",
      "SignatureDoesNotMatch"
    ];
    var THROTTLING_ERROR_CODES = [
      "BandwidthLimitExceeded",
      "EC2ThrottledException",
      "LimitExceededException",
      "PriorRequestNotComplete",
      "ProvisionedThroughputExceededException",
      "RequestLimitExceeded",
      "RequestThrottled",
      "RequestThrottledException",
      "SlowDown",
      "ThrottledException",
      "Throttling",
      "ThrottlingException",
      "TooManyRequestsException",
      "TransactionInProgressException"
      // DynamoDB
    ];
    var TRANSIENT_ERROR_CODES = ["TimeoutError", "RequestTimeout", "RequestTimeoutException"];
    var TRANSIENT_ERROR_STATUS_CODES = [500, 502, 503, 504];
    var NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"];
    var isRetryableByTrait = /* @__PURE__ */ __name((error) => error.$retryable !== void 0, "isRetryableByTrait");
    var isClockSkewError = /* @__PURE__ */ __name((error) => CLOCK_SKEW_ERROR_CODES.includes(error.name), "isClockSkewError");
    var isThrottlingError = /* @__PURE__ */ __name((error) => {
      var _a, _b;
      return ((_a = error.$metadata) == null ? void 0 : _a.httpStatusCode) === 429 || THROTTLING_ERROR_CODES.includes(error.name) || ((_b = error.$retryable) == null ? void 0 : _b.throttling) == true;
    }, "isThrottlingError");
    var isTransientError = /* @__PURE__ */ __name((error) => {
      var _a;
      return TRANSIENT_ERROR_CODES.includes(error.name) || NODEJS_TIMEOUT_ERROR_CODES.includes((error == null ? void 0 : error.code) || "") || TRANSIENT_ERROR_STATUS_CODES.includes(((_a = error.$metadata) == null ? void 0 : _a.httpStatusCode) || 0);
    }, "isTransientError");
    var isServerError = /* @__PURE__ */ __name((error) => {
      var _a;
      if (((_a = error.$metadata) == null ? void 0 : _a.httpStatusCode) !== void 0) {
        const statusCode = error.$metadata.httpStatusCode;
        if (500 <= statusCode && statusCode <= 599 && !isTransientError(error)) {
          return true;
        }
        return false;
      }
      return false;
    }, "isServerError");
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/patchers/aws3_p.js
var require_aws3_p = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/patchers/aws3_p.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.captureAWSClient = void 0;
    var service_error_classification_1 = require_dist_cjs();
    var aws_1 = __importDefault(require_aws());
    var querystring_1 = require("querystring");
    var subsegment_1 = __importDefault(require_subsegment());
    var contextUtils = require_context_utils();
    var logger = require_logger();
    var { safeParseInt } = require_utils();
    var utils_1 = require_utils();
    var XRAY_PLUGIN_NAME = "XRaySDKInstrumentation";
    var buildAttributesFromMetadata = async (service, operation, region, commandInput, res, error) => {
      var _a, _b, _c;
      const { extendedRequestId, requestId, httpStatusCode: statusCode, attempts } = ((_a = res === null || res === void 0 ? void 0 : res.output) === null || _a === void 0 ? void 0 : _a.$metadata) || (error === null || error === void 0 ? void 0 : error.$metadata);
      const aws = new aws_1.default({
        extendedRequestId,
        requestId,
        retryCount: attempts,
        data: res === null || res === void 0 ? void 0 : res.output,
        request: {
          operation,
          params: commandInput,
          httpRequest: {
            region,
            statusCode
          }
        }
      }, service);
      const http = {};
      if (statusCode) {
        http.response = {};
        http.response.status = statusCode;
      }
      if (((_b = res === null || res === void 0 ? void 0 : res.response) === null || _b === void 0 ? void 0 : _b.headers) && ((_c = res === null || res === void 0 ? void 0 : res.response) === null || _c === void 0 ? void 0 : _c.headers["content-length"]) !== void 0) {
        if (!http.response) {
          http.response = {};
        }
        http.response.content_length = safeParseInt(res.response.headers["content-length"]);
      }
      return [aws, http];
    };
    function addFlags(http, subsegment, err) {
      var _a, _b, _c;
      if (err && (0, service_error_classification_1.isThrottlingError)(err)) {
        subsegment.addThrottleFlag();
      } else if (safeParseInt((_a = http.response) === null || _a === void 0 ? void 0 : _a.status) === 429 || safeParseInt((_b = err === null || err === void 0 ? void 0 : err.$metadata) === null || _b === void 0 ? void 0 : _b.httpStatusCode) === 429) {
        subsegment.addThrottleFlag();
      }
      const cause = (0, utils_1.getCauseTypeFromHttpStatus)(safeParseInt((_c = http.response) === null || _c === void 0 ? void 0 : _c.status));
      if (cause === "fault") {
        subsegment.addFaultFlag();
      } else if (cause === "error") {
        subsegment.addErrorFlag();
      }
    }
    var getXRayMiddleware = (config, manualSegment) => (next, context) => async (args) => {
      var _a;
      const segment = contextUtils.isAutomaticMode() ? contextUtils.resolveSegment() : manualSegment;
      const { clientName, commandName } = context;
      const commandInput = (_a = args === null || args === void 0 ? void 0 : args.input) !== null && _a !== void 0 ? _a : {};
      const commandOperation = commandName.slice(0, -7);
      const operation = commandOperation.charAt(0).toLowerCase() + commandOperation.slice(1);
      const service = clientName.slice(0, -6);
      if (!segment) {
        const output = service + "." + operation;
        if (!contextUtils.isAutomaticMode()) {
          logger.getLogger().info("Call " + output + " requires a segment object passed to captureAWSv3Client for tracing in manual mode. Ignoring.");
        } else {
          logger.getLogger().info("Call " + output + " is missing the sub/segment context for automatic mode. Ignoring.");
        }
        return next(args);
      }
      let subsegment;
      if (segment.notTraced) {
        subsegment = segment.addNewSubsegmentWithoutSampling(service);
      } else {
        subsegment = segment.addNewSubsegment(service);
      }
      subsegment.addAttribute("namespace", "aws");
      const parent = segment instanceof subsegment_1.default ? segment.segment : segment;
      const data = parent.segment ? parent.segment.additionalTraceData : parent.additionalTraceData;
      let traceHeader = (0, querystring_1.stringify)({
        Root: parent.trace_id,
        Parent: subsegment.id,
        Sampled: subsegment.notTraced ? "0" : "1"
      }, ";");
      if (data != null) {
        for (const [key, value] of Object.entries(data)) {
          traceHeader += ";" + key + "=" + value;
        }
      }
      args.request.headers["X-Amzn-Trace-Id"] = traceHeader;
      let res;
      try {
        res = await next(args);
        if (!res) {
          throw new Error("Failed to get response from instrumented AWS Client.");
        }
        const [aws, http] = await buildAttributesFromMetadata(service, operation, await config.region(), commandInput, res, null);
        subsegment.addAttribute("aws", aws);
        subsegment.addAttribute("http", http);
        addFlags(http, subsegment);
        subsegment.close();
        return res;
      } catch (err) {
        if (err.$metadata) {
          const [aws, http] = await buildAttributesFromMetadata(service, operation, await config.region(), commandInput, null, err);
          subsegment.addAttribute("aws", aws);
          subsegment.addAttribute("http", http);
          addFlags(http, subsegment, err);
        }
        const errObj = { message: err.message, name: err.name, stack: err.stack || new Error().stack };
        subsegment.close(errObj, true);
        throw err;
      }
    };
    var xRayMiddlewareOptions = {
      name: XRAY_PLUGIN_NAME,
      step: "build"
    };
    var getXRayPlugin = (config, manualSegment) => ({
      applyToStack: (stack) => {
        stack.add(getXRayMiddleware(config, manualSegment), xRayMiddlewareOptions);
      }
    });
    function captureAWSClient(client, manualSegment) {
      client.middlewareStack.remove(XRAY_PLUGIN_NAME);
      client.middlewareStack.use(getXRayPlugin(client.config, manualSegment));
      return client;
    }
    exports2.captureAWSClient = captureAWSClient;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/patchers/http_p.js
var require_http_p = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/patchers/http_p.js"(exports2, module2) {
    "use strict";
    var url = require("url");
    var contextUtils = require_context_utils();
    var Utils = require_utils();
    var logger = require_logger();
    var events = require("events");
    var captureHTTPsGlobal = function captureHTTPsGlobal2(module3, downstreamXRayEnabled, subsegmentCallback) {
      if (!module3.__request) {
        enableCapture(module3, downstreamXRayEnabled, subsegmentCallback);
      }
    };
    var captureHTTPs = function captureHTTPs2(module3, downstreamXRayEnabled, subsegmentCallback) {
      if (module3.__request) {
        return module3;
      }
      var tracedModule = {};
      Object.keys(module3).forEach(function(val) {
        tracedModule[val] = module3[val];
      });
      enableCapture(tracedModule, downstreamXRayEnabled, subsegmentCallback);
      return tracedModule;
    };
    function enableCapture(module3, downstreamXRayEnabled, subsegmentCallback) {
      function captureOutgoingHTTPs(baseFunc, ...args) {
        let options;
        let callback;
        let hasUrl;
        let urlObj;
        let arg0 = args[0];
        if (typeof args[1] === "object") {
          hasUrl = true;
          urlObj = typeof arg0 === "string" ? new url.URL(arg0) : arg0;
          options = args[1], callback = args[2];
        } else {
          hasUrl = false;
          options = arg0;
          callback = args[1];
        }
        if (!options || options.headers && options.headers["X-Amzn-Trace-Id"]) {
          return baseFunc(...args);
        }
        if (typeof options === "string") {
          options = new url.URL(options);
        }
        if (!hasUrl) {
          urlObj = options;
        }
        const parent = contextUtils.resolveSegment(contextUtils.resolveManualSegmentParams(options));
        const hostname = options.hostname || options.host || urlObj.hostname || urlObj.host || "Unknown host";
        if (!parent) {
          let output = "[ host: " + hostname;
          output = options.method ? output + ", method: " + options.method : output;
          output += ", path: " + (urlObj.pathname || Utils.stripQueryStringFromPath(options.path)) + " ]";
          if (!contextUtils.isAutomaticMode()) {
            logger.getLogger().info("Options for request " + output + ' requires a segment object on the options params as "XRaySegment" for tracing in manual mode. Ignoring.');
          } else {
            logger.getLogger().info("Options for request " + output + " is missing the sub/segment context for automatic mode. Ignoring.");
          }
          return baseFunc(...args);
        }
        let subsegment;
        if (parent.notTraced) {
          subsegment = parent.addNewSubsegmentWithoutSampling(hostname);
        } else {
          subsegment = parent.addNewSubsegment(hostname);
        }
        const root = parent.segment ? parent.segment : parent;
        subsegment.namespace = "remote";
        if (!options.headers) {
          options.headers = {};
        }
        options.headers["X-Amzn-Trace-Id"] = "Root=" + root.trace_id + ";Parent=" + subsegment.id + ";Sampled=" + (subsegment.notTraced ? "0" : "1");
        const errorCapturer = function errorCapturer2(e) {
          if (subsegmentCallback) {
            subsegmentCallback(subsegment, this, null, e);
          }
          if (subsegment.http && subsegment.http.response) {
            if (Utils.getCauseTypeFromHttpStatus(subsegment.http.response.status) === "error") {
              subsegment.addErrorFlag();
            }
            subsegment.close(e, true);
          } else {
            const madeItToDownstream = e.code !== "ECONNREFUSED";
            subsegment.addRemoteRequestData(this, null, madeItToDownstream && downstreamXRayEnabled);
            subsegment.close(e);
          }
        };
        const optionsCopy = Utils.objectWithoutProperties(options, ["Segment"], true);
        let req = baseFunc(...hasUrl ? [arg0, optionsCopy] : [options], function(res) {
          res.on("end", function() {
            if (subsegmentCallback) {
              subsegmentCallback(subsegment, this.req, res);
            }
            if (res.statusCode === 429) {
              subsegment.addThrottleFlag();
            }
            const cause = Utils.getCauseTypeFromHttpStatus(res.statusCode);
            if (cause) {
              subsegment[cause] = true;
            }
            subsegment.addRemoteRequestData(res.req, res, !!downstreamXRayEnabled);
            subsegment.close();
          });
          if (typeof callback === "function") {
            if (contextUtils.isAutomaticMode()) {
              const session = contextUtils.getNamespace();
              session.run(function() {
                contextUtils.setSegment(subsegment);
                callback(res);
              });
            } else {
              callback(res);
            }
          } else if (res.req && res.req.listenerCount("response") === 0) {
            res.resume();
          }
        });
        req.on(events.errorMonitor || "error", errorCapturer);
        return req;
      }
      module3.__request = module3.request;
      function captureHTTPsRequest(...args) {
        return captureOutgoingHTTPs(module3.__request, ...args);
      }
      module3.__get = module3.get;
      function captureHTTPsGet(...args) {
        return captureOutgoingHTTPs(module3.__get, ...args);
      }
      Object.defineProperties(module3, {
        request: { value: captureHTTPsRequest, configurable: true, enumerable: true, writable: true },
        get: { value: captureHTTPsGet, configurable: true, enumerable: true, writable: true }
      });
    }
    module2.exports.captureHTTPsGlobal = captureHTTPsGlobal;
    module2.exports.captureHTTPs = captureHTTPs;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/patchers/promise_p.js
var require_promise_p = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/patchers/promise_p.js"(exports2, module2) {
    "use strict";
    var contextUtils = require_context_utils();
    var originalThen = Symbol("original then");
    var originalCatch = Symbol("original catch");
    function patchPromise(Promise2) {
      const then = Promise2.prototype.then;
      if (!then[originalThen]) {
        Promise2.prototype.then = function(onFulfilled, onRejected) {
          if (contextUtils.isAutomaticMode() && tryGetCurrentSegment()) {
            const ns = contextUtils.getNamespace();
            onFulfilled = onFulfilled && ns.bind(onFulfilled);
            onRejected = onRejected && ns.bind(onRejected);
          }
          return then.call(this, onFulfilled, onRejected);
        };
        Promise2.prototype.then[originalThen] = then;
      }
      const origCatch = Promise2.prototype.catch;
      if (origCatch && !origCatch[originalCatch]) {
        Promise2.prototype.catch = function(onRejected) {
          if (contextUtils.isAutomaticMode() && tryGetCurrentSegment()) {
            const ns = contextUtils.getNamespace();
            onRejected = onRejected && ns.bind(onRejected);
          }
          return origCatch.call(this, onRejected);
        };
        Promise2.prototype.catch[originalCatch] = origCatch;
      }
    }
    function unpatchPromise(Promise2) {
      const then = Promise2.prototype.then;
      if (then[originalThen]) {
        Promise2.prototype.then = then[originalThen];
      }
      const origCatch = Promise2.prototype.catch;
      if (origCatch && origCatch[originalCatch]) {
        Promise2.prototype.catch = origCatch[originalCatch];
      }
    }
    function tryGetCurrentSegment() {
      try {
        return contextUtils.getSegment();
      } catch (e) {
        return void 0;
      }
    }
    function capturePromise() {
      patchPromise(Promise);
    }
    function uncapturePromise() {
      unpatchPromise(Promise);
    }
    capturePromise.patchThirdPartyPromise = patchPromise;
    module2.exports.capturePromise = capturePromise;
    module2.exports.uncapturePromise = uncapturePromise;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/database/sql_data.js
var require_sql_data = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/database/sql_data.js"(exports2, module2) {
    "use strict";
    function SqlData(databaseVer, driverVer, user, url, queryType) {
      this.init(databaseVer, driverVer, user, url, queryType);
    }
    SqlData.prototype.init = function init(databaseVer, driverVer, user, url, queryType) {
      if (databaseVer) {
        this.database_version = databaseVer;
      }
      if (driverVer) {
        this.driver_version = driverVer;
      }
      if (queryType) {
        this.preparation = queryType;
      }
      this.url = url;
      this.user = user;
    };
    module2.exports = SqlData;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/aws-xray.js
var require_aws_xray = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/aws-xray.js"(exports2, module2) {
    "use strict";
    var contextUtils = require_context_utils();
    var logging = require_logger();
    var segmentUtils = require_segment_utils();
    var utils = require_utils();
    var LambdaEnv = require_aws_lambda();
    var pkginfo = {};
    try {
      pkginfo = require_package();
    } catch (err) {
      logging.getLogger().debug("Failed to load SDK data:", err);
    }
    var UNKNOWN = "unknown";
    var AWSXRay2 = {
      /**
       * @memberof AWSXRay
       * @type {object}
       * @namespace AWSXRay.plugins
       */
      plugins: {
        /**
         * Exposes the AWS EC2 plugin.
         * @memberof AWSXRay.plugins
         */
        EC2Plugin: require_ec2_plugin(),
        /**
         * Exposes the AWS ECS plugin.
         * @memberof AWSXRay.plugins
         */
        ECSPlugin: require_ecs_plugin(),
        /**
         * Exposes the AWS Elastic Beanstalk plugin.
         * @memberof AWSXRay.plugins
         */
        ElasticBeanstalkPlugin: require_elastic_beanstalk_plugin()
      },
      /**
       * Enables use of plugins to capture additional data for segments.
       * @param {Array} plugins - A configurable subset of AWSXRay.plugins.
       * @memberof AWSXRay
       * @see AWSXRay.plugins
       */
      config: function(plugins) {
        var pluginData = {};
        plugins.forEach(function(plugin) {
          plugin.getData(function(data) {
            if (data) {
              for (var attribute in data) {
                pluginData[attribute] = data[attribute];
              }
            }
          });
          segmentUtils.setOrigin(plugin.originName);
          segmentUtils.setPluginData(pluginData);
        });
      },
      /**
       * Overrides the default whitelisting file to specify what params to capture on each AWS Service call.
       * If a service or API is not listed, no additional data is captured.
       * The base whitelisting file can be found at /lib/resources/aws_whitelist.json
       * @param {string|Object} source - The path to the custom whitelist file, or a whitelist source JSON object.
       * @memberof AWSXRay
       */
      setAWSWhitelist: require_aws().setAWSWhitelist,
      /**
       * Appends to the current whitelisting file.
       * In the case of a duplicate service API listed, the new source will override the previous values.
       * @param {string|Object} source - The path to the custom whitelist file, or a whitelist source JSON object.
       * @memberof AWSXRay
       */
      appendAWSWhitelist: require_aws().appendAWSWhitelist,
      /**
       * Overrides the default streaming threshold (100).
       * The threshold represents the maximum number of subsegments on a single segment before
       * the SDK begins to send the completed subsegments out of band of the main segment.
       * Reduce this threshold if you see the 'Segment too large to send' error.
       * @param {number} threshold - The new threshold to use.
       * @memberof AWSXRay
       */
      setStreamingThreshold: segmentUtils.setStreamingThreshold,
      /**
       * Set your own logger for the SDK.
       * @param {Object} logger - A logger which responds to debug/info/warn/error calls.
       * @memberof AWSXRay
       */
      setLogger: logging.setLogger,
      /**
       * Gets the set logger for the SDK.
       * @memberof AWSXRay
       */
      getLogger: logging.getLogger,
      /**
       * Configures the address and port the daemon is expected to be on.
       * @param {string} address - Address of the daemon the segments should be sent to.  Expects 'x.x.x.x', ':yyyy' or 'x.x.x.x:yyyy' IPv4 formats.
       * @module DaemonConfig
       * @memberof AWSXRay
       * @function
       * @see module:DaemonConfig.setDaemonAddress
       */
      setDaemonAddress: require_daemon_config().setDaemonAddress,
      /**
       * @param {string} name - The name of the new subsegment.
       * @param {function} fcn - The function conext to wrap.
       * @param {Segment|Subsegment} [parent] - The parent for the new subsegment, for manual mode.
       * @memberof AWSXRay
       * @function
       * @see module:capture.captureFunc
       */
      captureFunc: require_capture().captureFunc,
      /**
       * @param {string} name - The name of the new subsegment.
       * @param {function} fcn - The function conext to wrap.
       * @param {Segment|Subsegment} [parent] - The parent for the new subsegment, for manual mode.
       * @memberof AWSXRay
       * @function
       * @see module:capture.captureAsyncFunc
       */
      captureAsyncFunc: require_capture().captureAsyncFunc,
      /**
       * @param {string} name - The name of the new subsegment.
       * @param {function} fcn - The function conext to wrap.
       * @param {Segment|Subsegment} [parent] - The parent for the new subsegment, for manual mode.
       * @memberof AWSXRay
       * @function
       * @see module:capture.captureCallbackFunc
       */
      captureCallbackFunc: require_capture().captureCallbackFunc,
      /**
       * @param {AWS} awssdk - The Javascript AWS SDK.
       * @memberof AWSXRay
       * @function
       * @see module:aws_p.captureAWS
       */
      captureAWS: require_aws_p().captureAWS,
      /**
       * @param {AWS.Service} service - An instance of a AWS service to wrap.
       * @memberof AWSXRay
       * @function
       * @see module:aws_p.captureAWSClient
       */
      captureAWSClient: require_aws_p().captureAWSClient,
      /**
       * @param {AWSv3.Service} service - An instance of a AWS SDK v3 service to wrap.
       * @param {Segment|Subsegment} segment - Optional segment for manual mode.
       * @memberof AWSXRay
       * @function
       * @see module:aws3_p.captureAWSClient
       */
      captureAWSv3Client: require_aws3_p().captureAWSClient,
      /**
       * @param {http|https} module - The built in Node.js HTTP or HTTPS module.
       * @memberof AWSXRay
       * @function
       * @returns {http|https}
       * @see module:http_p.captureHTTPs
       */
      captureHTTPs: require_http_p().captureHTTPs,
      /**
       * @param {http|https} module - The built in Node.js HTTP or HTTPS module.
       * @memberof AWSXRay
       * @function
       * @see module:http_p.captureHTTPsGlobal
       */
      captureHTTPsGlobal: require_http_p().captureHTTPsGlobal,
      /**
       * @memberof AWSXRay
       * @function
       * @see module:promise_p.capturePromise
       */
      capturePromise: require_promise_p().capturePromise,
      /**
       * Exposes various helper methods.
       * @memberof AWSXRay
       * @function
       * @see module:utils
       */
      utils,
      /**
       * @memberof AWSXRay
       * @type {object}
       * @namespace AWSXRay.database
       */
      database: {
        /**
         * Exposes the SqlData class.
         * @memberof AWSXRay.database
         * @see SqlData
         */
        SqlData: require_sql_data()
      },
      /**
       * Exposes the Middleware Utils class.
       * @memberof AWSXRay
       * @function
       * @see module:mw_utils
       */
      middleware: require_mw_utils(),
      /**
       * Gets the current namespace of the context.
       * Used for supporting functions that can be used in automatic mode.
       * @memberof AWSXRay
       * @function
       * @returns {Segment|Subsegment}
       * @see module:context_utils.getNamespace
       */
      getNamespace: contextUtils.getNamespace,
      /**
       * Resolves the current segment or subsegment, checks manual and automatic modes.
       * Used for supporting functions that can be used in both manual and automatic modes.
       * @memberof AWSXRay
       * @function
       * @returns {Segment|Subsegment}
       * @see module:context_utils.resolveSegment
       */
      resolveSegment: contextUtils.resolveSegment,
      /**
       * Resolves the segment or subsegment given manual mode and params on the call required.
       * @param [Segment|Subsegment] segment - The segment manually provided via params.XraySegment, if provided.
       * @memberof AWSXRay
       * @function
       * @returns {Segment|Subsegment}
       * @see module:context_utils.resolveManualSegmentParams
       */
      resolveManualSegmentParams: contextUtils.resolveManualSegmentParams,
      /**
       * Returns the current segment or subsegment. For use with automatic mode only.
       * @memberof AWSXRay
       * @function
       * @returns {Segment|Subsegment}
       * @see module:context_utils.getSegment
       */
      getSegment: contextUtils.getSegment,
      /**
       * Sets the current segment or subsegment.  For use with automatic mode only.
       * @memberof AWSXRay
       * @function
       * @see module:context_utils.setSegment
       */
      setSegment: contextUtils.setSegment,
      /**
       * Returns true if automatic mode is enabled, otherwise false.
       * @memberof AWSXRay
       * @function
       * @see module:context_utils.isAutomaticMode
       */
      isAutomaticMode: contextUtils.isAutomaticMode,
      /**
       * Enables automatic mode. Automatic mode uses 'cls-hooked'.
       * @see https://github.com/jeff-lewis/cls-hooked
       * @memberof AWSXRay
       * @function
       * @see module:context_utils.enableAutomaticMode
       */
      enableAutomaticMode: contextUtils.enableAutomaticMode,
      /**
       * Disables automatic mode. Current segment or subsegment must be passed manually
       * via the parent optional on captureFunc, captureAsyncFunc etc.
       * @memberof AWSXRay
       * @function
       * @see module:context_utils.enableManualMode
       */
      enableManualMode: contextUtils.enableManualMode,
      /**
       * Sets the context missing strategy.
       * @param {Object} strategy - The strategy to set. This object's contextMissing function will be called whenever trace context is not found.
       */
      setContextMissingStrategy: contextUtils.setContextMissingStrategy,
      /**
       * Exposes the segment class.
       * @memberof AWSXRay
       * @function
       */
      Segment: require_segment(),
      /**
       * Exposes the subsegment class.
       * @memberof AWSXRay
       * @see Subsegment
       */
      Subsegment: require_subsegment(),
      SegmentUtils: segmentUtils
    };
    AWSXRay2.middleware.IncomingRequestData = require_incoming_request_data(), function() {
      var data = {
        runtime: process.release && process.release.name ? process.release.name : UNKNOWN,
        runtime_version: process.version,
        version: process.env.npm_package_version || UNKNOWN,
        name: process.env.npm_package_name || UNKNOWN
      };
      var sdkData = {
        sdk: "X-Ray for Node.js",
        sdk_version: pkginfo.version ? pkginfo.version : UNKNOWN,
        package: pkginfo.name ? pkginfo.name : UNKNOWN
      };
      segmentUtils.setSDKData(sdkData);
      segmentUtils.setServiceData(data);
      if (process.env.LAMBDA_TASK_ROOT) {
        LambdaEnv.init();
      }
    }();
    module2.exports = AWSXRay2;
  }
});

// node_modules/aws-xray-sdk-core/dist/lib/index.js
var require_lib = __commonJS({
  "node_modules/aws-xray-sdk-core/dist/lib/index.js"(exports2, module2) {
    "use strict";
    module2.exports = require_aws_xray();
  }
});

// src/__tests__/backend/deny-list/integ/trigger.client-test.lambda.ts
var trigger_client_test_lambda_exports = {};
__export(trigger_client_test_lambda_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(trigger_client_test_lambda_exports);
var assert = __toESM(require("assert"));

// src/backend/deny-list/constants.ts
var ENV_DENY_LIST_BUCKET_NAME = "DENY_LIST_BUCKET_NAME";
var ENV_DENY_LIST_OBJECT_KEY = "DENY_LIST_OBJECT_KEY";

// src/backend/shared/aws.lambda-shared.ts
var _AWS = __toESM(require("aws-sdk"));
var AWSXRay = __toESM(require_lib());
AWSXRay.setContextMissingStrategy(() => {
});
var AWS = AWSXRay.captureAWS(_AWS);
var _s3;
function s3() {
  if (_s3 == null) {
    _s3 = new AWS.S3();
  }
  return _s3;
}

// src/backend/shared/env.lambda-shared.ts
var import_process = require("process");
function requireEnv(name) {
  const result = import_process.env[name];
  if (!result) {
    throw new Error(
      `No value specified for required environment variable: ${name}`
    );
  }
  return result;
}

// src/backend/deny-list/client.lambda-shared.ts
var DenyListClient = class _DenyListClient {
  /**
   * Creates a new client for accessing the deny list.
   */
  static async newClient() {
    const client = new _DenyListClient();
    await client.init();
    return client;
  }
  constructor() {
    this.bucketName = requireEnv(ENV_DENY_LIST_BUCKET_NAME);
    this.objectKey = requireEnv(ENV_DENY_LIST_OBJECT_KEY);
    this.s3 = s3();
  }
  /**
   * Downloads the deny list and stores it in memory.
   *
   * This must be called before `lookup()`.
   */
  async init() {
    if (this._map) {
      throw new Error("init() cannot be called twice");
    }
    this._map = {};
    try {
      const params = {
        Bucket: this.bucketName,
        Key: this.objectKey
      };
      const { Body: body } = await this.s3.getObject(params).promise();
      if (!body) {
        console.log(
          `WARNING: deny list body is empty at ${this.bucketName}/${this.objectKey}`
        );
        return;
      }
      const contents = body.toString("utf-8");
      if (contents.length === 0) {
        return;
      }
      const data = JSON.parse(contents);
      if (typeof data != "object") {
        throw new Error(
          `Invalid format in deny list file at ${this.bucketName}/${this.objectKey}. Expecting a map`
        );
      }
      this._map = data;
    } catch (e) {
      if (e.code === "NoSuchKey" || e.code === "NoSuchBucket") {
        return;
      }
      throw new Error(
        `Unable to parse deny list file ${this.bucketName}/${this.objectKey}: ${e}`
      );
    }
  }
  /**
   * Checks if a package (name + version) is in the deny list.
   * @param name The name of the package
   * @param version The package version
   * @returns `undefined` if the package is not in the deny list or a
   * `DenyListRule` otherwise.
   */
  lookup(name, version) {
    if (!this._map) {
      throw new Error("DenyListClient must be initialized");
    }
    return this._map[name] ?? this._map[`${name}/v${version}`];
  }
  /**
   * Returns a copy of the deny list map.
   */
  get map() {
    if (!this._map) {
      throw new Error("DenyListClient must be initialized");
    }
    return this._map;
  }
};

// src/__tests__/backend/deny-list/integ/trigger.client-test.lambda.ts
var RULE1 = {
  packageName: "mypackage",
  reason: '"mypackage" is deprecated'
};
var RULE2 = {
  packageName: "your",
  version: "1.2.3",
  reason: 'v1.2.3 of "your" has a security issue'
};
async function handler() {
  const client = await DenyListClient.newClient();
  assert.deepStrictEqual(client.map, {
    mypackage: RULE1,
    "your/v1.2.3": RULE2
  });
  assert.deepStrictEqual(client.lookup("mypackage", "1.2.3"), RULE1);
  assert.deepStrictEqual(client.lookup("mypackage", "1.0.1"), RULE1);
  assert.deepStrictEqual(client.lookup("your", "1.0.0"), void 0);
  assert.deepStrictEqual(client.lookup("your", "1.2.3"), RULE2);
  assert.deepStrictEqual(client.lookup("boom", "1.2.3"), void 0);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
