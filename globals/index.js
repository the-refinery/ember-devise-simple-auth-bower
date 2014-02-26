(function(__exports__) {
  "use strict";
  var defaults = {
    signInPath: "/sign-in",
    deviseSignInPath: "/users/sign_in",
    deviseSignOutPath: "/users/sign_out",
    currentSessionPath: "/sessions/current"
  };

  var getSetting = function(app, setting) {
    var prefixedKey = "deviseSimpleAuth." + setting;
    return app.getWithDefault(prefixedKey, defaults[setting]);
  };

  __exports__.getSetting = getSetting;
})((Ember['DeviseSimpleAuth']||(Ember['DeviseSimpleAuth']={}))['configuration']={});(function(__exports__, __dependency1__, __dependency2__) {
  "use strict";
  var Authenticator = __dependency1__;
  var getSetting = __dependency2__.getSetting;

  var initializer = {
    name: 'authenticator',
    initialize: function(container, app) {
      var signInPath = getSetting(app, "deviseSignInPath"),
          signOutPath = getSetting(app, "deviseSignOutPath"),
          currentSessionPath = getSetting(app, "currentSessionPath");

      var auth = Authenticator.create();

      auth.set("signInPath", signInPath)
          .set("signOutPath", signOutPath)
          .set("currentSessionPath", currentSessionPath);

      container.register("devise-simple-auth:authenticator", auth, {instantiate: false});
      app.inject("route", "authenticator", "devise-simple-auth:authenticator");
      app.inject("controller", "auth", "devise-simple-auth:authenticator");
    }
  };

  __exports__.initializer = initializer;
})((Ember['DeviseSimpleAuth']||(Ember['DeviseSimpleAuth']={}))['initializers/authenticator']={}, undefined, undefined);(function() {
  "use strict";
  $(document).on("ajaxComplete", function(event, xhr, settings) {
    var csrf_param = xhr.getResponseHeader('X-CSRF-Param'),
        csrf_token = xhr.getResponseHeader('X-CSRF-Token');

    if (csrf_param) {
      $('meta[name="csrf-param"]').attr('content', csrf_param);
    }
    if (csrf_token) {
      $('meta[name="csrf-token"]').attr('content', csrf_token);
    }
  });
})();(function(__exports__, __dependency1__) {
  "use strict";
  var getSetting = __dependency1__.getSetting;

  var initializer = {
    name: 'session-route',
    initialize: function(container, app) {
      app.Router.map(function() {
        this.route("session", {path: getSetting(app, "signInPath")});
      });
    }
  };

  __exports__.initializer = initializer;
})((Ember['DeviseSimpleAuth']||(Ember['DeviseSimpleAuth']={}))['initializers/session-route']={}, undefined);(function(__exports__) {
  "use strict";
  var Authenticator = Ember.Object.extend({
    email: null,
    password: null,
    currentSession: null,
    isSignedIn: false,
    setupSession: function(session) {
      this.set("isSignedIn", true)
           .set("currentSession", session);
      return session;
    },
    teardownSession: function() {
      this.set("isSignedIn", false)
          .set("currentSession", null);
    },
    // Options: force: true|false // Requires user to have a session
    loadSession: function(storeOrFinder, options) {
      var result,
          setup = this.setupSession.bind(this);

      return this.ajax("get", this.get("currentSessionPath"))
                 .then(setup)
                 .catch(function(error) {
                    if(!options.force) {
                     return Ember.RSVP.resolve();
                    } else {
                     return error;
                    }
                 });
    },
    signIn: function() {
      var setup = this.setupSession.bind(this),
          data = {
            user: {
              email: this.get("email"),
              password: this.get("password")
            }
          }

      return this.ajax("post", this.get("signInPath"), data)
                 .then(setup);
    },
    signOut: function() {
      var teardown = this.teardownSession.bind(this);

      return this.ajax("delete", this.get("signOutPath"))
                 .then(teardown);
    },
    ajax: function(method, url, data) {
      return new Ember.RSVP.Promise(function(resolve) {
        return resolve($.ajax({
          url: url,
          type: method,
          dataType: "json",
          data: data
        }));
      });
    }
  });

  __exports__.Authenticator = Authenticator;
})((Ember['DeviseSimpleAuth']||(Ember['DeviseSimpleAuth']={}))['models/authenticator']={});(function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__) {
  "use strict";
  var app = __dependency1__;
  var tryAction = __dependency3__.tryAction;
  var SessionRouteInitializer = __dependency4__;
  var AuthenticatorInitializer = __dependency5__;

  function lookupTargetRoute(transition, container) {
    var key = "route:" + transition.targetName
    return container.lookup(key);
  }

  Ember.Route.reopen({
    beforeModel: function(transition) {
      var targetRoute = lookupTargetRoute(transition, this.container),
          requiresAuth = !targetRoute.skipsAuthentication,
          _this = this;

      return this.get("authenticator")
                 .loadSession(this.get("store"), {force: requiresAuth})
                 .catch(function() {
                   _this.transitionTo("session");
                 });
    },
    _actions: {
      signOut: function() {
        this.get("authenticator").signOut();
        tryAction(this, "didSignOut", function() {
          this.transitionTo("session");
        });
      },
      willTransition: function(transition) {
        var targetRoute = lookupTargetRoute(transition, this.container),
            needsAuth = !(this.get("authenticator.isSignedIn")
                          || targetRoute.skipsAuthentication);

        if(needsAuth) {
          this.transitionTo("session");
        } else {
          return true;
        }
      },
      error: function(reason) {
        if(reason.status == 401 || reason.status == 403) {
          tryAction(this, "unauthorizedRequest", function() {
            this.transitionTo("session");
          });
        } else {
          return true;
        }
      }
    }
  });

  Ember.Controller.reopen({
    isSignedIn: Ember.computed.alias("auth.isSignedIn"),
    currentSession: Ember.computed.alias("auth.currentSession")
  });

  app.initializer(SessionRouteInitializer);
  app.initializer(AuthenticatorInitializer);
})(undefined, undefined, undefined, undefined, undefined);(function(__exports__, __dependency1__) {
  "use strict";
  var tryAction = __dependency1__.tryAction;

  var SessionRoute = Ember.Route.extend({
    skipsAuthentication: true,
    model: function() {
      return this.get("authenticator");
    },
    actions: {
      signIn: function() {
        var route = this;
        this.get("authenticator").signIn().
          then(function(session) {
            tryAction(route, "validSignIn", session);
          }).catch(function(error) {
            var controller = route.controllerFor("session");
            controller.set("loginFailed", true);
            tryAction(route, "invalidSignIn", error);
          });
      }
    }
  })


  __exports__.SessionRoute = SessionRoute;
})((Ember['DeviseSimpleAuth']||(Ember['DeviseSimpleAuth']={}))['routes/session']={}, undefined);(function(__exports__) {
  "use strict";
  // Checks message for string from unhandled action error.
  //
  // "Nothing handled the action '" + name + "'. If you did handle the action, this error can be caused by returning true from an action handler in a controller, causing the action to bubble."
  //
  function isUnhandledAction(message) {
    return message.match(/^Nothing handled the action/);
  }

  function tryAction(target, action) {
    var args = Array.prototype.slice.call(arguments, 1, arguments.length);
    var possibleCb = args[args.length - 1];

    try {
      target.send.apply(target, args);
    } catch(error) {
      // Swallow 'Nothing handled action' errors
      if(!isUnhandledAction(error.message)) {
        throw error;
      } else if(typeof possibleCb === "function") {
        possibleCb.apply(target, args);
      }
    }
  }

  __exports__.tryAction = tryAction;
})((Ember['DeviseSimpleAuth']||(Ember['DeviseSimpleAuth']={}))['utils']={});