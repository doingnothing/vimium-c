// Generated by CoffeeScript 1.8.0
(function() {
  "use strict";
  var BackgroundCommands, checkKeyQueue //
    , frameIdsForTab, ContentSettings //
    , handleMainPort, handleResponse, postResponse, funcDict //
    , helpDialogHtmlForCommandGroup, keyQueue, namedKeyRegex //
    , openMultiTab //
    , populateKeyCommands, splitKeyQueueRegex //
    , removeTabsRelative, selectTab //
    , requestHandlers, sendRequestToAllTabs //
    , shouldShowUpgradeMessage, firstKeys, splitKeyQueue //
    , secondKeys, currentFirst, shouldShowActionIcon, setBadge;

  shouldShowActionIcon = chrome.browserAction && chrome.browserAction.setIcon ? true : false;

  window.currentVersion = Utils.getCurrentVersion();

  keyQueue = "";

  frameIdsForTab = {};
  
  window.getFrameIdsForTab = function() {
    return frameIdsForTab;
  };

  namedKeyRegex = /^(<[^>]+>)(.*)$/;

  window.helpDialogHtml = function(showUnboundCommands, showCommandNames, customTitle) {
    var command, commandsToKey, dialogHtml, group, key;
    commandsToKey = {};
    for (key in Commands.keyToCommandRegistry) {
      command = Commands.keyToCommandRegistry[key].command;
      commandsToKey[command] = (commandsToKey[command] || []).concat(key);
    }
    dialogHtml = Settings.get("help_dialog");
    return dialogHtml.replace(new RegExp("\\{\\{(version|title|" + Object.keys(Commands.commandGroups).join('|') + ")\\}\\}", "g"), function(_, group) {
      return (group === "version") ? currentVersion
        : (group === "title") ? (customTitle || "Help")
        : helpDialogHtmlForCommandGroup(group, commandsToKey, Commands.availableCommands, showUnboundCommands, showCommandNames);
    });
  };

  helpDialogHtmlForCommandGroup = function(group, commandsToKey, availableCommands, showUnboundCommands, showCommandNames) {
    var bindings, command, html, isAdvanced, _i, _len, _ref;
    html = [];
    _ref = Commands.commandGroups[group];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      command = _ref[_i];
      bindings = (commandsToKey[command] || [""]).join(", ");
      if (showUnboundCommands || commandsToKey[command]) {
        isAdvanced = Commands.advancedCommands.indexOf(command) >= 0;
        html.push("<tr class='vimB vimI vimHelpTr" + (isAdvanced ? " vimHelpAdvanced" : "")
          , "'>\n\t<td class='vimB vimI vimHelpTd vimHelpShortKey'>\n\t\t<span class='vimB vimI vimHelpShortKey2'>", Utils.escapeHtml(bindings)
          , "</span>\n\t</td>\n\t<td class='vimB vimI vimHelpTd'>:</td>\n\t<td class='vimB vimI vimHelpTd vimHelpCommandInfo'>"
          , Utils.escapeHtml(availableCommands[command].description));
        if (showCommandNames) {
          html.push("\n\t\t<span class='vimB vimI vimHelpCommandName'>(" + command + ")</span>");
        }
        html.push("</td>\n</tr>\n");
      }
    }
    return html.join("");
  };

  window.fetchHttpContents = function(url, success, onerror) {
    var req = new XMLHttpRequest(), i = url.indexOf(":"), j;
    url = i >= 0 && ((j = url.indexOf("?")) === -1 || j > i) ? url : chrome.runtime.getURL(url);
    req.open("GET", url, true);
    req.onreadystatechange = function () {
      if(req.readyState === 4) {
        var text = req.responseText, status = req.status;
        req = null;
        if (status === 200) {
          success(text);
        } else if (onerror) {
          onerror(status, text);
        }
      }
    };
    req.send();
    return req;
  };

  openMultiTab = function(rawUrl, index, count, parentTab, active) {
    if (!(count >= 1)) return;
    var option = {
      url: rawUrl,
      windowId: parentTab.windowId,
      index: index,
      openerTabId: parentTab.id,
      selected: active !== false
    };
    chrome.tabs.create(option, option.selected ? function(tab) {
      chrome.windows.update(tab.windowId, {focused: true});
    } : null);
    if (count < 2) return;
    option.selected = false;
    while(--count >= 1) {
      ++option.index;
      chrome.tabs.create(option, callback);
    }
  };

  ContentSettings = {
    _urlHeadRegex: /^[a-z]+:\/\/[^\/]+\//,
    clear: function(contentType, tab) {
      var cs = chrome.contentSettings[contentType];
      if (tab) {
        cs.clear({ scope: (tab.incognito ? "incognito_session_only" : "regular") });
        return;
      }
      cs.clear({ scope: "regular" });
      cs.clear({ scope: "incognito_session_only" }, function() {
        return chrome.runtime.lastError;
      });
    },
    turnCurrent: function(contentType, tab) {
      if (!Utils.hasOrdinaryUrlPrefix(tab.url) || tab.url.startsWith("chrome")) {
        return;
      }
      var pattern = tab.url, _this = this;
      chrome.contentSettings[contentType].get({
        primaryUrl: pattern,
        incognito: tab.incognito
      }, function (opt) {
        if (!pattern.startsWith("file:")) {
          pattern = _this._urlHeadRegex.exec(pattern)[0] + "*";
        }
        chrome.contentSettings[contentType].set({
          primaryPattern: pattern,
          scope: tab.incognito ? "incognito_session_only" : "regular",
          setting: (opt && opt.setting === "allow") ? "block" : "allow"
        }, function() {
          ++tab.index;
          _this.reopenTab(tab);
        });
      });
    },
    ensure: function (contentType, tab) {
      if (!Utils.hasOrdinaryUrlPrefix(tab.url) || tab.url.startsWith("chrome")) {
        return;
      }
      var pattern = tab.url, _this = this;
      chrome.contentSettings[contentType].get({primaryUrl: pattern, incognito: true }, function(opt) {
        if (!pattern.startsWith("file:")) {
          pattern = _this._urlHeadRegex.exec(pattern)[0] + "*";
        }
        if (chrome.runtime.lastError) {
          chrome.contentSettings[contentType].get({primaryUrl: tab.url}, function (opt) {
            if (opt && opt.setting === "allow") { return; }
            opt = {type: "normal", incognito: true, focused: false, url: Settings.ChromeInnerNewTab};
            chrome.windows.create(opt, function (wnd) {
              var leftTabId = wnd.tabs[0].id;
              _this.setAndUpdate(contentType, tab, pattern, wnd.id, true, function() {
                chrome.tabs.remove(leftTabId);
              });
            });
          });
          return chrome.runtime.lastError;
        }
        if (opt && opt.setting === "allow" && tab.incognito) {
          _this.updateTab(tab);
          return;
        }
        chrome.windows.getAll(function(wnds) {
          wnds = wnds.filter(funcDict.isIncNor);
          if (!wnds.length) {
            console.log("%cContentSettings.ensure", "color:red;", "get incognito content settings", opt //
              , " but can not find a incognito window");
          } else if (opt && opt.setting === "allow") {
            _this.updateTab(tab, wnds[wnds.length - 1].id);
          } else if (tab.incognito && wnds.filter(function(wnd) { return wnd.id === tab.windowId; }).length === 1) {
            _this.setAndUpdate(contentType, tab, pattern);
          } else {
            _this.setAndUpdate(contentType, tab, pattern, wnds[wnds.length - 1].id);
          }
        });
      });
    },
    setAndUpdate: function(contentType, tab, pattern, wndId, doSyncWnd, callback) {
      callback = this.updateTabAndWindow.bind(this, tab, wndId, callback);
      this.setAllowInIncognito(contentType, pattern, doSyncWnd && wndId !== tab.windowId
        ? chrome.windows.get.bind(chrome.windows, tab.windowId, callback) : callback);
    },
    setAllowInIncognito: function(contentType, pattern, callback) {
      chrome.contentSettings[contentType].set({
        primaryPattern: pattern,
        scope: "incognito_session_only",
        setting: "allow"
      }, function() {
        if (callback) {
          callback();
        }
        return chrome.runtime.lastError;
      });
    },
    updateTabAndWindow: function(tab, wndId, callback, oldWnd) {
      this.updateTab(tab, wndId, callback);
      wndId && chrome.windows.update(wndId, {
        focused: true,
        state: oldWnd ? oldWnd.state : undefined
      });
    },
    updateTab: function(tab, newWindowId, callback) {
      tab.windowId = newWindowId ? newWindowId : tab.windowId;
      tab.selected = true;
      if (!newWindowId || tab.windowId === newWindowId) {
        ++tab.index;
      } else {
        delete tab.index;
      }
      this.reopenTab(tab);
      if (callback) {
        callback();
      }
    },
    reopenTab: function(tab) {
      chrome.tabs.create({
        windowId: tab.windowId,
        selected: true,
        url: tab.url,
        index: tab.index
      });
      chrome.tabs.remove(tab.id);
    }
  };

  funcDict = {
    isIncNor: function(wnd) {
      return wnd.incognito && wnd.type === "normal";
    },
    makeTempWindow: function(tabIdUrl, incognito, callback) {
      chrome.windows.create({
        type: "normal",
        left: 0, top: 0, width: 50, height: 50,
        focused: false,
        incognito: incognito,
        tabId: tabIdUrl > 0 ? tabIdUrl : undefined,
        url: tabIdUrl > 0 ? undefined : tabIdUrl
      }, callback);
    },
    updateActiveState: !shouldShowActionIcon ? function() {} : function(tabId, url, response) {
      if (response) {
        var config, currentPasskeys, enabled, isCurrentlyEnabled, passKeys;
        isCurrentlyEnabled = response.enabled;
        currentPasskeys = response.passKeys;
        config = Exclusions.getRule(url);
        if (config) {
          enabled = !config.passKeys;
          passKeys = config.passKeys;
        } else {
          enabled = false;
          passKeys = "";
        }
        enabled = config.enabled;
        passKeys = config.passKeys;
        chrome.browserAction.setIcon({
          tabId: tabId,
          path: !enabled ? "img/icons/browser_action_disabled.png"
              : passKeys ? "img/icons/browser_action_partial.png"
                         : "img/icons/browser_action_enabled.png"
        })
        if (isCurrentlyEnabled !== enabled || currentPasskeys !== passKeys) {
          chrome.tabs.sendMessage(tabId, {
            name: "setState",
            enabled: enabled,
            passKeys: passKeys
          });
        }
      } else {
        chrome.browserAction.setIcon({
          tabId: tabId,
          path: "img/icons/browser_action_disabled.png"
        });
        return setBadge({badge: ""});
      }
    },

    openUrlInIncognito: function(request, tab, wnds) {
      wnds = wnds.filter(funcDict.isIncNor);
      request.active = (request.active !== false);
      request.url = Utils.convertToUrl(request.url);
      if (wnds.length) {
        var inCurWnd = wnds.filter(function(wnd) {
          return wnd.id === tab.windowId
        }).length > 0, options = {
          url: request.url,
          windowId: inCurWnd ? tab.windowId : wnds[wnds.length - 1].id
        };
        if (inCurWnd) {
          options.index = tab.index + 1;
          options.openerTabId = tab.id;
        }
        chrome.tabs.create(options);
        if (request.active && !inCurWnd) {
          chrome.windows.update(options.windowId, {focused: true});
        }
        return;
      }
      chrome.windows.create({
        type: "normal",
        url: request.url,
        incognito: true
      }, function(newWnd) {
        if (!request.active) {
          chrome.windows.update(tab.windowId, {focused: true});
        }
        chrome.windows.get(tab.windowId, function(wnd) {
          if (wnd.type === "normal") {
            chrome.windows.update(newWnd.id, {state: wnd.state});
          }
        });
      })
    },

    createTab: [function(tab, count, wnd) {
      var url = Settings.get("newTabUrl");
      if (!(wnd.incognito && Utils.isRefusingIncognito(url))) {
        openMultiTab(url, tab.index + 1, count, tab);
        return;
      }
      // this url will be disabled if opened in a incognito window directly
      chrome.tabs.getAllInWindow(tab.windowId, //
      funcDict.createTab[1].bind(url, tab, count > 1 ? function(newTab) {
        var left = count, id = newTab.id;
        while (--left > 0) {
          chrome.tabs.duplicate(id);
        }
      } : null));
    }, function(tab, repeat, allTabs) {
      var urlLower = this.toLowerCase().split('#', 1)[0], tabs;
      if (urlLower.indexOf("://") < 0) {
        urlLower = chrome.runtime.getURL(urlLower);
      }
      allTabs = allTabs.filter(function(tab1) {
        var url = tab1.url.toLowerCase(), end = url.indexOf("#");
        return ((end < 0) ? url : url.substring(0, end)) === urlLower;
      });
      if (allTabs.length === 0) {
        chrome.windows.getAll(funcDict.createTab[2].bind(this, tab, repeat));
        return;
      }
      tabs = allTabs.filter(function(tab1) { return tab1.index >= tab.index; });
      tab = tabs.length > 0 ? tabs[0] : allTabs[allTabs.length - 1];
      chrome.tabs.duplicate(tab.id);
      repeat && repeat(tab);
    }, function(tab, repeat, wnds) {
      wnds = wnds.filter(function(wnd) {
        return !wnd.incognito && wnd.type === "normal";
      });
      if (wnds.length > 0) {
        funcDict.createTab[3](this, tab, repeat, wnds[0]);
        return;
      }
      funcDict.makeTempWindow(Settings.ChromeInnerNewTab, false, //
      funcDict.createTab[3].bind(null, this, tab, function(newTab) {
        chrome.windows.remove(newTab.windowId);
        repeat && repeat(newTab);
      }));
    }, function(url, tab, callback, wnd) {
      chrome.tabs.create({
        selected: false,
        windowId: wnd.id,
        url: url
      }, function(newTab) {
        funcDict.makeTempWindow(newTab.id, true, //
        funcDict.createTab[4].bind(tab, callback, newTab));
      });
    }, function(callback, newTab) {
      chrome.tabs.move(newTab.id, {
        index: this.index + 1,
        windowId: this.windowId
      }, function() {
        callback && callback(newTab);
        chrome.tabs.update(newTab.id, { selected: true });
      });
    }],
    duplicateTab: function(tab, count, wnd) {
      if (wnd.incognito && !tab.incognito) {
        while (--count > 0) {
          chrome.tabs.duplicate(tab.id);
        }
      } else {
        openMultiTab(tab.url, tab.index + 2, count - 1, tab, false);
      }
    },
    moveTabToNextWindow: [function(tab, wnds0) {
      var wnds, ids, index, state;
      wnds = wnds0.filter(function(wnd) { return wnd.incognito === tab.incognito && wnd.type === "normal"; });
      if (wnds.length > 0) {
        ids = wnds.map(function(wnd) { return wnd.id; });
        index = ids.indexOf(tab.windowId);
        if (ids.length >= 2 || index === -1) {
          chrome.tabs.getSelected(ids[(index + 1) % ids.length] //
            , funcDict.moveTabToNextWindow[1].bind(null, tab, index));
          return;
        }
      } else {
        index = tab.windowId;
        wnds = wnds0.filter(function(wnd) { return wnd.id === index; });
      }
      if (wnds.length === 1 && wnds[0].type === "normal") {
        state = wnds[0].state;
      }
      chrome.windows.create({
        type: "normal",
        tabId: tab.id,
        incognito: tab.incognito
      }, state ? function(wnd) {
        chrome.windows.update(wnd.id, {state: state});
      } : null);
    }, function(tab, oldIndex, tab2) {
      if (oldIndex >= 0) {
        funcDict.moveTabToNextWindow[2](tab, tab2);
        return;
      }
      funcDict.makeTempWindow(tab.id, tab.incognito, //
      funcDict.moveTabToNextWindow[2].bind(null, tab, tab2));
    }, function(tab, tab2) {
      chrome.tabs.move(tab.id, {index: tab2.index + 1, windowId: tab2.windowId});
      chrome.tabs.update(tab.id, {selected: true});
      chrome.windows.update(tab2.windowId, {focused: true});
    }],
    moveTabToIncognito: [function(tab, wnd) {
      if (wnd.incognito && tab.incognito) { return; }
      var options = {type: "normal", tabId: tab.id, incognito: true}, url = tab.url;
      if (tab.incognito) {
      } else if (Utils.isRefusingIncognito(url)) {
        if (wnd.incognito) {
          return;
        }
      } else if (wnd.incognito) {
        chrome.tabs.create({url: url, index: tab.index + 1, windowId: wnd.id});
        chrome.tabs.remove(tab.id);
        return;
      } else {
        options.url = url;
      }
      chrome.windows.getAll(funcDict.moveTabToIncognito[1].bind(null, options, wnd));
    }, function(options, wnd, wnds) {
      var tabId;
      wnds = wnds.filter(funcDict.isIncNor);
      if (wnds.length) {
        chrome.tabs.getSelected(wnds[wnds.length - 1].id,
        funcDict.moveTabToIncognito[2].bind(null, options));
        return;
      }
      if (options.url) {
        tabId = options.tabId;
        options.tabId = undefined;
      }
      chrome.windows.create(options, wnd.type !== "normal" ? null : function(newWnd) {
        chrome.windows.update(newWnd.id, {state: wnd.state});
      });
      if (options.url) {
        chrome.tabs.remove(tabId);
      }
    }, function(options, tab2) {
      if (options.url) {
        chrome.tabs.create({url: options.url, index: tab2.index + 1, windowId: tab2.windowId});
        chrome.tabs.remove(options.tabId);
        chrome.windows.update(tab2.windowId, {focused: true});
        return;
      }
      funcDict.makeTempWindow(options.tabId, true, //
      funcDict.moveTabToIncognito[3].bind(null, options, tab2));
    }, function(options, tab2) {
      chrome.tabs.move(options.tabId, {index: tab2.index + 1, windowId: tab2.windowId});
      chrome.tabs.update(options.tabId, {selected: true});
      chrome.windows.update(tab2.windowId, {focused: true});
    }],
    removeTab: [function(tab, count, curTabs) {
      if (curTabs.length <= count) {
        chrome.windows.getAll(funcDict.removeTab[1].bind(null, tab, curTabs));
      } else if (0 < --count) {
        funcDict.removeTabsRelative(tab, count, true, curTabs);
      } else {
        chrome.tabs.remove(tab.id);
      }
    }, function(tab, curTabs, wnds) {
      var url = Settings.get("newTabUrl"), toCreate;
      wnds = wnds.filter(function(wnd) { return wnd.type === "normal"; });
      if (wnds.length <= 1) {
        // retain the last window
        toCreate = {};
        if (wnds.length === 1 && wnds[0].incognito && !Utils.isRefusingIncognito(url)) {
          toCreate.windowId = wnds[0].id;
        }
        // other urls will be disabled if incognito else auto in current window
      }
      else if (!tab.incognito) {
        // retain the last "normal & not incognito" window which has currentTab if it exists
        wnds = wnds.filter(function(wnd) { return !wnd.incognito; });
        if (wnds.length === 1 && wnds[0].id === tab.windowId) {
          toCreate = { windowId: tab.windowId };
        }
      }
      if (toCreate) {
        curTabs = (curTabs.length > 1) ? curTabs.map(function(tab) { return tab.id; }) : [tab.id];
        toCreate.url = url;
        chrome.tabs.create(toCreate);
        chrome.tabs.remove(curTabs);
      } else {
        chrome.windows.remove(tab.windowId);
      }
    }],
    removeTabsRelative: function(activeTab, direction, removeActive, tabs) {
      var i = activeTab.index;
      if (direction > 0) {
        tabs = tabs.slice(i + (removeActive ? 0 : 1), i + direction + 1);
      } else {
        if (direction < 0) {
          tabs = tabs.slice(Math.max(i + direction, 0), i + (removeActive ? 1 : 0));
        } else if (!removeActive) {
          tabs.splice(i, 1);
        }
        if (!activeTab.pinned) {
          tabs = tabs.filter(function(tab) { return !tab.pinned; });
        }
      }
      if (tabs.length > 0) {
        chrome.tabs.remove(tabs.map(function(tab) { return tab.id; }));
      }
    }
  };

  // function (const Tab tab, const int repeatCount);
  BackgroundCommands = {
    createTab: function(tab, count) {
      chrome.windows.get(tab.windowId, funcDict.createTab[0].bind(null, tab, count));
    },
    duplicateTab: function(tab, count) {
      chrome.tabs.duplicate(tab.id);
      if (!(count > 1)) {
        return;
      }
      chrome.windows.get(tab.windowId, funcDict.duplicateTab.bind(null, tab, count));
    },
    moveTabToNextWindow: function(tab) {
      chrome.windows.getAll(funcDict.moveTabToNextWindow[0].bind(null, tab));
    },
    moveTabToIncognito: function(tab) {
      chrome.windows.get(tab.windowId, funcDict.moveTabToIncognito[0].bind(null, tab));
    },
    enableImageTemp: function(tab) {
      ContentSettings.ensure("images", tab);
    },
    toggleImage: function(tab) {
      ContentSettings.turnCurrent("images", tab);
    },
    clearImageCS: function(tab) {
      ContentSettings.clear("images", tab);
    },
    nextTab: function(tab, count) {
      selectTab(tab, count);
    },
    previousTab: function(tab, count) {
      selectTab(tab, -count);
    },
    firstTab: function(tab) {
      selectTab(tab, -tab.index);
    },
    lastTab: function(tab) {
      selectTab(tab, -tab.index - 1);
    },
    removeTab: function(tab, count) {
      if (tab.index === 0) {
        chrome.tabs.getAllInWindow(tab.windowId, funcDict.removeTab[0].bind(null, tab, count));
      } else if (0 < --count) {
        removeTabsRelative(tab, count, true);
      } else {
        chrome.tabs.remove(tab.id);
      }
    },
    restoreTab: function(_0, count, sessionId) {
      if (sessionId) {
        chrome.sessions.restore(sessionId);
        return;
      }
      while (--count >= 0) {
        chrome.sessions.restore();
      }
    },
    openCopiedUrlInCurrentTab: function(tab) {
      requestHandlers.openUrlInCurrentTab({
        url: Clipboard.paste()
      }, tab);
    },
    openCopiedUrlInNewTab: function(tab, count) {
      openMultiTab(Utils.convertToUrl(Clipboard.paste()), tab.index + 1, count, tab);
    },
    togglePinTab: function(tab) {
      chrome.tabs.update(tab.id, {
        pinned: !tab.pinned
      });
    },
    reloadTab: function(tab) {
      chrome.tabs.update(tab.id, {
        url: tab.url
      });
    },
    reopenTab: function(tab) {
      ++tab.index;
      if (!Utils.isRefusingIncognito(tab.url)) {
        ContentSettings.reopenTab(tab);
        return;
      }
      chrome.windows.get(tab.windowId, function(wnd) {
        if (!wnd.incognito) {
          ContentSettings.reopenTab(tab);
        }
      });
    },
    moveTabLeft: function(tab, count) {
      chrome.tabs.move(tab.id, {
        index: Math.max(0, tab.index - count)
      });
    },
    moveTabRight: function(tab, count) {
      chrome.tabs.move(tab.id, {
        index: tab.index + count
      });
    },
    nextFrame: function(tab, count, frameId) {
      var tabId = tab.id, frames = frameIdsForTab[tabId];
      if (!frames) { return; }
      if (frameId) {
        count += Math.max(0, frames.indexOf(frameId));
      }
      if (count %= frames.length) {
        chrome.tabs.sendMessage(tab.id, {
          name: "focusFrame",
          frameId: frames[count],
          highlight: true
        });
      }
    },
    closeTabsOnLeft: function(tab, count) {
      removeTabsRelative(tab, -count);
    },
    closeTabsOnRight: function(tab, count) {
      removeTabsRelative(tab, count);
    },
    closeOtherTabs: function(tab) {
      removeTabsRelative(tab, 0);
    }
  };

  removeTabsRelative = function(tab, direction, removeActive) {
    chrome.tabs.getAllInWindow(tab.windowId, funcDict.removeTabsRelative.
      bind(null, tab, direction, removeActive ? true : false));
  };

  selectTab = function(tab, step) {
    chrome.tabs.getAllInWindow(tab.windowId, function(tabs) {
      if (!(tabs.length > 1)) {
        return;
      }
      var toSelect = tabs[(tab.index + step + tabs.length) % tabs.length];
      chrome.tabs.update(toSelect.id, {
        selected: true
      });
    });
  };

  window.updateActiveState = setBadge = function() {};

  window.setShouldShowActionIcon = !shouldShowActionIcon ? function() {} : (function() {
    var onActiveChanged, currentBadge, badgeTimer, updateBadge, time1 = 50, setShouldShowActionIcon;
    chrome.browserAction.setBadgeBackgroundColor({color: [82, 156, 206, 255]});
    onActiveChanged = function(tabId, selectInfo) {
      chrome.tabs.get(tabId, function(tab) {
        chrome.tabs.sendMessage(tabId, {
          name: "getActiveState"
        }, funcDict.updateActiveState.bind(null, tabId, tab.url));
      });
    };
    updateBadge = function(badge) {
      badgeTimer = 0;
      chrome.browserAction.setBadgeText({text: badge});
    };
    setBadge = function(request) {
      var badge = request.badge;
      if (badge != null && badge !== currentBadge) {
        currentBadge = badge;
        if (badgeTimer) {
          clearTimeout(badgeTimer);
        }
        badgeTimer = setTimeout(updateBadge.bind(null, badge), time1);
      }
    };
    window.updateActiveState = function(tabId, url) {
      chrome.tabs.sendMessage(tabId, {
        name: "getActiveState"
      }, funcDict.updateActiveState.bind(null, tabId, url));
    };
    setShouldShowActionIcon = function (value) {
      value = value ? true : false;
      if (value === shouldShowActionIcon) { return; }
      shouldShowActionIcon = value;
      // TODO: hide icon
      if (shouldShowActionIcon) {
        chrome.tabs.onActiveChanged.addListener(onActiveChanged);
        chrome.browserAction.enable();
      } else {
        chrome.tabs.onActiveChanged.removeListener(onActiveChanged);
        chrome.browserAction.disable();
      }
    };
    Settings.setUpdateHook("showActionIcon", setShouldShowActionIcon);
    return setShouldShowActionIcon;
  })();

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status !== "loading" || frameIdsForTab[tabId]) {
      return; // topFrame is alive, so loading is caused by may an iframe
    }
    Marks.RemoveMarksForTab(tabId);
    shouldShowActionIcon && updateActiveState(tabId, tab.url);
  });

  populateKeyCommands = function() {
    var key, len, len2, ref1, ref2, first;
    ref1 = firstKeys = [];
    ref2 = secondKeys = {};
    for (key in Commands.keyToCommandRegistry) {
      if (key.charCodeAt(0) === 60) {
        len = key.indexOf(">") + 1;
        if (len === key.length) {
          ref1.push(key);
          continue;
        }
      } else if (key.length <= 1) {
        ref1.push(key);
        continue;
      } else {
        len = 1;
      }
      if ((key.indexOf(">", len) + 1 || (len + 1)) !== key.length) {
        console.warn("invalid key command:", key);
        continue;
      }
      first = key.substring(0, len);
      key = key.substring(len);
      if (first in ref2) {
        ref2[first].push(key);
      } else {
        ref1.push(first);
        ref2[first] = [key];
      }
    }
    ref1.sort().reverse();
    for (first in ref2) {
      ref2[first].sort().reverse();
    }
    ref2[""] = [];
  };

  Settings.setUpdateHook("postKeyMappings", function() {
    populateKeyCommands();
    currentFirst = keyQueue = "";
    sendRequestToAllTabs({
      name: "refreshKeyMapping",
      firstKeys: firstKeys,
      secondKeys: secondKeys
    });
  });

  handleResponse = function(msgId, func, request, tab) {
    this.postMessage({_msgId: msgId, response: func(request, tab)});
  };
  
  postResponse = function(msgId, response) {
    this.postMessage({_msgId: msgId, response: response});
  };

  handleMainPort = function(request, port) {
    var key, func, msgId;
    if (msgId = request._msgId) {
      request = request.request;
      if (key = request.handler) {
        if (func = requestHandlers[key]) {
          if (func.useTab) {
            chrome.tabs.getSelected(null, handleResponse.bind(port, msgId, func, request));
          } else {
            port.postMessage({_msgId: msgId, response: func(request)})
          }
        } else {
          port.postMessage({_msgId: msgId, error: -1});
        }
      }
      else if (key = request.handlerOmni) {
        func = Completers[key];
        key = request.query;
        func.filter(key ? key.split(" ") : [], postResponse.bind(port, msgId));
      }
    }
    else if (key = request.handlerKey) {
      if (key === "<esc>") {
        currentFirst = key = "";
      } else {
        key = checkKeyQueue(keyQueue + key, port);
      }
      if (keyQueue !== key) {
        keyQueue = key;
        port.postMessage({
          name: "refreshKeyQueue",
          keyQueue: keyQueue,
          currentFirst: currentFirst
        });
      }
    }
    else if (key = request.handler) {
      if (func = requestHandlers[key]) {
        if (func.useTab) {
          chrome.tabs.getSelected(null, func.bind(null, request));
        } else {
          func(request);
        }
      }
    }
    else if (key = request.handlerSettings) {
      var tabId = port.sender.tab.id, i, ref;
      switch (key) {
      case "get":
        var values;
        if (ref = request.keys) {
          values = ref.map(Settings.get.bind(Settings));
        } else {
          values = Settings.bufferToLoad;
        }
        port.postMessage({
          name: "settings",
          keys: ref,
          values: values,
          response: (request = request.request) && (func = requestHandlers[request.handler])
            ? func(request) : undefined
        });
        break;
      case "set": Settings.set(request.key, request.value); break;
      case "reg":
        port.postMessage({
          name: "registerFrame",
          css: Settings.get("userDefinedCss_f"),
          tabId: tabId,
          version: (shouldShowUpgradeMessage ? currentVersion : ""),
        });
        // no `break;`
      case "rereg":
        i = request.frameId;
        if (i > 0) {
          ref = frameIdsForTab[tabId];
          if (ref) {
            ref.push(i);
          } else {
            frameIdsForTab[tabId] = [i];
          }
        }
        break;
      case "unreg":
        if (request.isTop) {
          delete frameIdsForTab[tabId];
        } else if (ref = frameIdsForTab[tabId]) {
          i = ref.indexOf(request.frameId);
          if (i === ref.length - 1) {
            ref.pop();
          } else if (i >= 0) {
            ref.splice(i, 1);
          }
        }
        break;
      }
    }
  };

  splitKeyQueueRegex = /([0-9]*)(.*)/;

  checkKeyQueue = function(command, port) {
    var command, count, registryEntry, splitHash;
    splitHash = splitKeyQueueRegex.exec(command);
    if (!splitHash[2]) {
      return command === "0" ? "" : command;
    } else if (registryEntry = Commands.keyToCommandRegistry[command = splitHash[2]]) {
      count = parseInt(splitHash[1] || 1, 10);
    } else if ((count = (command.charCodeAt(0) === 60) ? (command.indexOf(">") + 1) : 1) >= command.length) {
      command = command.substring(0, count);
      if (command in secondKeys) {
        currentFirst = command;
        return splitHash[0];
      }
      return "";
    } else if (registryEntry = Commands.keyToCommandRegistry[command = command.substring(count)]) {
      count = 1;
    } else {
      currentFirst = "";
      if (count = command.charCodeAt(0) - 48) {
        if (count > 0 && count <= 9) {
          return command;
        } else if (command in secondKeys) {
          return currentFirst = command;
        }
      }
      return "";
    }
    command = registryEntry.command;
    if (registryEntry.noRepeat === true) {
      count = 1;
    } else if (!(registryEntry.noRepeat > 0 && count > registryEntry.noRepeat)) {
    } else if (!
      confirm("You have asked vim++ to perform " + count + " repeats of the command:\n\t"
        + Commands.availableCommands[command].description
        + "\n\nAre you sure you want to continue?")
    ) {
      count = 0;
    }
    if (count <= 0) {
    } else if (registryEntry.background) {
      chrome.tabs.getSelected(null, function(tab) {
        BackgroundCommands[command](tab, count);
      });
    } else {
      port.postMessage({
        name: "executePageCommand",
        command: command,
        count: (registryEntry.noRepeat === false ? -count : count)
      });
      keyQueue = "";
    }
    currentFirst = "";
    return "";
  };

  sendRequestToAllTabs = function (args) {
    chrome.windows.getAll({
      populate: true
    }, function(windows) {
      var _i, _len, _j, _len1, _ref;
      for (_i = 0, _len = windows.length; _i < _len; _i++) {
        if (windows[_i].type !== "normal") {
          continue;
        }
        _ref = windows[_i].tabs;
        for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
          chrome.tabs.sendMessage(_ref[_j].id, args, null);
        }
      }
    });
  };

  // function (request, Tab tab = null);
  requestHandlers = {
    getCurrentTabUrl: function(_0, tab) {
      return tab.url;
    },
    parseSearchUrl: function(request) {
      var url = request.url, map, decoders, pattern, _i, str, arr;
      if (!Utils.hasOrdinaryUrlPrefix(url)) {
        return "";
      }
      map = Settings.get("searchEnginesMap");
      decoders = map[""];
      for (_i = decoders.length; 0 <= --_i; ) {
        pattern = decoders[_i];
        if (url.startsWith(str = pattern[0])) {
          arr = pattern[1].exec(url.substring(str.length));
          if (arr && (str = arr[1])) {
            url = pattern[2];
            if (map[url].$s) {
              str = str.split("+").map(Utils.decodeURLPart).join(" ");
            } else {
              str = Utils.decodeURLPart(str);
            }
            return url + " " + str;
          }
        }
      }
      return "";
    },
    restoreSession: function(request) {
      BackgroundCommands.restoreTab(null, 0, request.sessionId);
    },
    openUrlInNewTab: function(request, tab) {
      openMultiTab(Utils.convertToUrl(request.url), tab.index + 1, 1, tab);
    },
    openUrlInIncognito: function(request, tab) {
      chrome.windows.getAll(funcDict.openUrlInIncognito.bind(null, request, tab));
    },
    openUrlInCurrentTab: function(request, tab) {
      chrome.tabs.update(tab.id, {
        url: Utils.convertToUrl(request.url)
      });
    },
    openOptionsPageInNewTab: function(_0, tab) {
      openMultiTab(chrome.runtime.getURL("pages/options.html"), tab.index + 1, 1, tab);
    },
    frameFocused: function(request) {
      var frames = frameIdsForTab[request.tabId], ind;
      if (frames && frames.length > 1 && (ind = frames.indexOf(request.frameId)) > 0) {
        frameIdsForTab[request.tabId] = frames.splice(ind, frames.length - ind).concat(frames);
      }
      return {
        keyQueue: keyQueue,
        currentFirst: currentFirst
      }
    },
    nextFrame: function(request, tab) {
      BackgroundCommands.nextFrame(tab, 1, request.frameId);
    },
    initHelp: function() {
      return window.helpDialogHtml();
    },
    initVomnibar: function() {
      return Settings.get("vomnibar");
    },
    upgradeNotificationClosed: function(request) {
      Settings.set("previousVersion", currentVersion);
      shouldShowUpgradeMessage = false;
      sendRequestToAllTabs({ name: "hideUpgradeNotification" });
    },
    copyToClipboard: function(request) {
      Clipboard.copy(request.data);
    },
    isEnabledForUrl: function(request) {
      var rule = Exclusions.getRule(request.url), ret;
      return (rule && !rule.passKeys) ? { enabled: false } : {
        enabled: true,
        keyQueue: keyQueue,
        currentFirst: currentFirst,
        passKeys: (rule ? rule.passKeys : ""),
        firstKeys: firstKeys,
        secondKeys: secondKeys
      };
    },
    saveHelpDialogSettings: function(request) {
      Settings.set("helpDialog_showAdvancedCommands", request.showAdvancedCommands);
    },
    selectSpecificTab: function(request) {
      chrome.tabs.get(request.sessionId, function(tab) {
        chrome.tabs.update(request.sessionId, { selected: true });
        chrome.windows.update(tab.windowId, { focused: true });
      });
    },
    refreshCompleter: function(request) {
      Completers[request.omni].refresh();
    },
    setBadge: setBadge,
    createMark: Marks.Create,
    gotoMark: Marks.GoTo
  };

  Settings.reloadFiles();
  Settings.postUpdate("searchEngines", null);
  Settings.postUpdate("userDefinedCss");
  Settings.bufferToLoad = Settings.valuesToLoad.map(Settings.get.bind(Settings));

  chrome.commands.onCommand.addListener(function(command) {
    if (command === "restoreTab") {
      BackgroundCommands[command](null, 1);
      return;
    }
    chrome.tabs.getSelected(function(tab) {
      BackgroundCommands[command](tab, 1);
      return chrome.runtime.lastError;
    });
  });

  chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === "main") {
      port.onMessage.addListener(handleMainPort);
    } else {
      port.disconnect();
    }
  });

  Commands.clearKeyMappingsAndSetDefaults();
  Commands.parseCustomKeyMappings(Settings.get("keyMappings"));
  populateKeyCommands();

  shouldShowActionIcon = false;
  window.setShouldShowActionIcon(Settings.get("showActionIcon"));

  (function() {
    var ref, i, key, callback, ref2;
    ref = ["getCurrentTabUrl", "openUrlInNewTab", "openUrlInIncognito", "openUrlInCurrentTab" //
      , "openOptionsPageInNewTab", "nextFrame", "createMark" //
    ];
    for (i = ref.length; 0 <= --i; ) {
      requestHandlers[ref[i]].useTab = true;
    }

    key = Settings.get("previousVersion");
    if (!key) {
      Settings.set("previousVersion", currentVersion);
      shouldShowUpgradeMessage = false;
    } else {
      shouldShowUpgradeMessage = (Utils.compareVersions(currentVersion, key) === 1);
    }

    sendRequestToAllTabs({
      name: "reRegisterFrame"
    });

    if (typeof Sync === "object" && typeof Sync.init === "function" && Settings.get("vimSync") === true) {
      Sync.init();
    } else {
      var blank = function() {};
      window.Sync = {debug: false, clear: blank, set: blank, init: blank};
    }
  })();

  ContentSettings.clear("images");

})();

chrome.runtime.onInstalled.addListener(function(details) {
  var contentScripts, js, css, allFrames, _i, _len, reason = details.reason;
  if (["chrome_update", "shared_module_update"].indexOf(reason) >= 0) { return; }
  contentScripts = chrome.runtime.getManifest().content_scripts[0];
  js = contentScripts.js;
  css = (details.reason === "install" || window._DEBUG) ? contentScripts.css : [];
  allFrames = contentScripts.all_frames;
  contentScripts = null;
  for (_i = css.length; 0 <= --_i; ) {
    css[_i] = {file: css[_i], allFrames: allFrames};
  }
  for (_i = js.length; 0 <= --_i; ) {
    js[_i] = {file: js[_i], allFrames: allFrames};
  }
  chrome.tabs.query({
    status: "complete"
  }, function(tabs) {
    var _i = tabs.length, tabId, _j, _len, callback, url;
    callback = function() { return chrome.runtime.lastError; };
    for (; 0 <= --_i; ) {
      url = tabs[_i].url;
      if (url.startsWith("chrome") || url.indexOf("://") === -1) continue;
      tabId = tabs[_i].id;
      for (_j = 0, _len = css.length; _j < _len; ++_j)
        chrome.tabs.insertCSS(tabId, css[_j], callback);
      for (_j = 0, _len = js.length; _j < _len; ++_j)
        chrome.tabs.executeScript(tabId, js[_j], callback);
    }
    console.log("%cvim %chas %cinstalled", "color:blue", "color:auto", "color:red", details);
  });
});