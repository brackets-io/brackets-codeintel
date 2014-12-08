/*
 * Copyright (c) 2014 Danny Moerkerke <danny@dannymoerkerke.nl>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets */

define(function (require, exports, module) {
    "use strict";

    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        Menus               = brackets.getModule("command/Menus"),
        NativeApp           = brackets.getModule("utils/NativeApp"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        Async               = brackets.getModule("utils/Async");


    // Constants
    var NAVIGATE_CODEINTEL  = "Codeintel",
        CMD_CODEINTEL    = "dannymoerkerke.codeIntel";
    
    function getSelection() {
        var editor = EditorManager.getActiveEditor(),
            sel,
            selection;

        if (!editor) {
            return null;
        }

        sel = editor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }

        selection = editor.getSelectedText();

        if (!selection) {
            editor.selectWordAt(sel.start);
            selection = editor.getSelectedText();
        }
        var prefix = editor.document.getRange({line: sel.start.line, ch: sel.start.ch-1}, {line: sel.start.line, ch: sel.start.ch});
        return {text: selection, prefix: prefix};
    }
    
    // build query and navigate to documentation
    function findMethod(name) {
        
        var editor = EditorManager.getActiveEditor();
        var curDoc = editor.document;
        var curFile = curDoc.file;
        
        var lines = StringUtils.getLines(curDoc.getText());
        var matchedLine;
        
        lines.map(function(line, index) {
           if(line.match('function ' + name)) {
               matchedLine = index;
           } 
        });
        
        if(matchedLine) {
            editor.setCursorPos(matchedLine);
        }
        else {

            var ext = curFile.fullPath.split('.').pop();
            var targetFile = name + '.' + ext;
            var root = ProjectManager.getProjectRoot();

            searchDirectory(root, targetFile, function(file) {
                CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: file.fullPath})
                .done(function(file) {
                    console.log(file);
                })
                .fail(function(e) {
                    console.error(e);
                })
                .always(function() {
                    console.log('always', arguments);
                });
            });
        }
        
    }
    
    function findFile(name) {
        
        var deferred = new $.Deferred()
        
        var editor = EditorManager.getActiveEditor();
        var curDoc = editor.document;
        var curFile = curDoc.file;
        
        var ext = curFile.fullPath.split('.').pop();
        var targetFile = name + '.' + ext;
        var root = ProjectManager.getProjectRoot();
        searchDirectory(root, targetFile, deferred);
        
//        searchDirectory(root, targetFile, function(file) {
//            
//            CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {fullPath: file.fullPath})
//            .done(function(file) {
//                console.log(file);
//            })
//            .fail(function(e) {
//                console.error(e);
//            })
//            .always(function() {
//                console.log('always', arguments);
//            });
//        });
        
        return deferred.promise();
    }
    
    function searchDirectory(directory, targetFile, deferred) {
        
        directory.getContents(function(a,items) {
            
            items.forEach(function(item) {
                if(typeof item.getContents === 'function') {
                    searchDirectory(item, targetFile, deferred); 
                }
                if(FileUtils.compareFilenames(FileUtils.getBaseName(item.fullPath), targetFile) === 0) {
                    
                    deferred.resolve(item);
                }
            });
            
        });

        
    }


   // Add command
    function handleCodeIntel() {
        var sel = getSelection();
        
        if(sel.prefix === '.' || sel.prefix === '>') {
            findMethod(sel);
        }
    }


    // Register the command and shortcut
    CommandManager.register(
        NAVIGATE_CODEINTEL,
        CMD_CODEINTEL,
        handleCodeIntel
    );
    KeyBindingManager.addBinding(CMD_CODEINTEL, "Ctrl-Alt-Space", "linux");
    KeyBindingManager.addBinding(CMD_CODEINTEL, "Cmd-Shift-Space", "mac");

    // Create a menu item bound to the command
    var menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
    menu.addMenuItem(CMD_CODEINTEL);
});
