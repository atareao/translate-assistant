/*
 * translate-assistant@atareao.es
 *
 * Copyright (c) 2022 Lorenzo Carbonell Cerezo <a.k.a. atareao>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

const {Gtk, Gdk, Gio, Clutter, St, GObject, GLib, Pango, PangoCairo, Meta, Shell, Soup} = imports.gi;
const Cairo = imports.cairo;

const MessageTray = imports.ui.messageTray;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext.domain(Extension.uuid);
const _ = Gettext.gettext;

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const SHELL_KEYBINDINGS_SCHEMA = "org.gnome.shell.keybindings";
const SHORTCUT_SETTING_KEY = "translate-assistant-clipboard";

const HTTP_TIMEOUT = 10;


var button;


function notify(msg, details, icon='translate-assistant-icon') {
    let source = new MessageTray.Source(Extension.uuid, icon);
    Main.messageTray.add(source);
    let notification = new MessageTray.Notification(source, msg, details);
    notification.setTransient(true);
    source.notify(notification);
}

var TranslateAssistant = GObject.registerClass(
    class TranslateAssistant extends PanelMenu.Button{
        _init(){
            super._init(St.Align.START);
            this._settings = ExtensionUtils.getSettings();
            this._loadPreferences();

            /* Icon indicator */
            let box = new St.BoxLayout();
            this.icon = new St.Icon({style_class: 'system-status-icon'});
            box.add(this.icon);
            this.add_child(box);

            let itemTranslation = this._buildMenu();
            this.menu.addMenuItem(itemTranslation);

            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            /* Setings */
            this.settingsMenuItem = new PopupMenu.PopupMenuItem(_("Settings"));
            this.settingsMenuItem.connect('activate', () => {
                ExtensionUtils.openPrefs();
            });
            this.menu.addMenuItem(this.settingsMenuItem);
            /* Init */
            this._set_icon_indicator(false);
            this._settingsChanged();
            this._settings.connect('changed',
                                   this._settingsChanged.bind(this));
        }

        _loadPreferences(){
            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));
            this._split_sentences = this._getValue('split-sentences');
            this._preserve_formatting = this._getValue('preserve-formatting');
            this._formality = this._getValue('formality');
            this._url = this._getValue('url');
            this._apikey = this._getValue('apikey');
            this._keybinding_translate_clipboard = this._getValue('keybinding-translate-clipboard');
            this._darktheme = this._getValue('darktheme');

            this._unbindShortcut();
            this._bindShortcut();
        }

        _bindShortcut(){
            Main.wm.addKeybinding("keybinding-translate-clipboard",
                                  this._settings,
                                  Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                                  Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                                  this._translate.bind(this)
            );
        }

        _unbindShortcut(){
            Main.wm.removeKeybinding(SHORTCUT_SETTING_KEY);
        }

        _translate(){
            Clipboard.get_text(CLIPBOARD_TYPE,(clipBoard, fromText) => {
                if(fromText){
                    let split_sentences = this._split_sentences?"1":"0";
                    let preserve_formatting = this._preserve_formatting?"1":"0";
                    let encodedFromText = encodeURIComponent(fromText);
                    let params = [];
                    params.push(
                        `auth_key=${this._apikey}`,
                        `text=${encodedFromText}`,
                        `source_lang=${this._source_lang}`,
                        `target_lang=${this._target_lang}`,
                        `split_sentences=${split_sentences}`,
                        `preserve_formatting=${preserve_formatting}`,
                        `formality=${this._formality}`,
                    );
                    let data = params.join("&");
                    let content_type = "application/x-www-form-urlencoded";
                    let message = Soup.Message.new('POST', this._url);
                    message.set_request(content_type, 2, data);
                    let httpSession = new Soup.Session();
                    httpSession.queue_message(message,
                        (httpSession, message) => {
                            if(message.status_code === Soup.KnownStatusCode.OK) {
                                try {
                                    let result = JSON.parse(message.response_body.data);
                                    if(result){
                                        let translations = result.translations;
                                        let toText = null;
                                        if (translations.length > 0){
                                            toText = translations[0].text;
                                        }else{
                                            toText = "";
                                        }
                                        this._update(fromText, toText);
                                    }
                                } catch(e) {
                                    log("== Translate assistant error ==");
                                    log(e);
                                }
                            }else{
                                log("Error in translate assistant");
                                log(message.status_code);
                                log(message.response_body.data);
                            }
                        }
                    );
                }
            });
        }

        _get_country_code(description){
            const regex = /^[^(]*\(([^)]*)\)$/gm;
            let m = regex.exec(description);
            if(m.length > 1){
                return m[1];
            }
            log("== ERROR ===");
            log(description);
            return null;
        }

        _update(from_text, to_text){
            this.inputEntry.get_clutter_text().set_text(from_text);
            this.outputEntry.get_clutter_text().set_text(to_text);
        }

        _buildMenu(){
            let section = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false
            });
            let scrollI = new St.ScrollView({
                width: 300,
                height: 300
            });
            let scrollO = new St.ScrollView({
                width: 300,
                height: 300,
            });
            let actor = new St.BoxLayout({
                reactive: true,
                x_expand: true,
                y_expand: true,
                x_align: St.Align.END,
                y_align: St.Align.MIDDLE,
                vertical: true
            });
            actor.add_child(scrollI);
            actor.add_child(scrollO);//Translate Input
            this.inputEntry = new St.Entry({
                name: 'inputEntry',
                style_class: 'entry',
                can_focus: true,
                track_hover: true
            });
            this.inputEntry.get_clutter_text().set_line_wrap(true);
            this.inputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            this.inputEntry.get_clutter_text().set_single_line_mode(false);
            this.inputEntry.get_clutter_text().set_activatable(true);
            this.inputEntry.set_height(300);
            //Translate Output
            this.outputEntry = new St.Entry({
                name: 'outputEntry',
                style_class: 'entry',
                can_focus: true,
                track_hover: true
            });
            this.outputEntry.get_clutter_text().set_line_wrap(true);
            this.outputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            this.outputEntry.get_clutter_text().set_single_line_mode(false);
            this.outputEntry.get_clutter_text().set_activatable(true);
            this.outputEntry.set_height(300);

            let _boxI = new St.BoxLayout({
                vertical: true,
            });
            _boxI.add_child(this.inputEntry, {
                y_align: St.Align.START,
                y_fill: true,
                x_fill: true,
            });
            let _boxO = new St.BoxLayout({
                vertical: true,
            });
            _boxO.add_child(this.outputEntry, {
                y_align: St.Align.START,
                y_fill: true,
                x_fill: true,
            });
            scrollI.add_actor(_boxI);
            scrollO.add_actor(_boxO);
            section.actor.add_actor(actor, { expand: true });
            return section;
        }

        _getValue(keyName){
            return this._settings.get_value(keyName).deep_unpack();
        }

        _set_icon_indicator(active){
            let themeString = (this._darktheme?'dark': 'light');
            let statusString = (active ? 'active' : 'paused');
            let iconString = `translate-assistant-${statusString}-${themeString}`;
            this.icon.set_gicon(this._get_icon(iconString));
        }

        _get_icon(iconName){
            const basePath = Extension.dir.get_child("icons").get_path();
            let fileIcon = Gio.File.new_for_path(
                `${basePath}/${iconName}.svg`);
            if(fileIcon.query_exists(null) == false){
                fileIcon = Gio.File.new_for_path(
                `${basePath}/${iconName}.png`);
            }
            if(fileIcon.query_exists(null) == false){
                return null;
            }
            return Gio.icon_new_for_string(fileIcon.get_path());
        }

        _settingsChanged(){
            this._loadPreferences();
        }

        disable(){
            this._unbindShortcut();
        }
    }
);

let translateAssistant;

function init(){
    ExtensionUtils.initTranslations();
}

function enable(){
    translateAssistant = new TranslateAssistant();
    Main.panel.addToStatusArea('translateAssistant', translateAssistant, 0, 'right');
}

function disable() {
    translateAssistant.disable();
    translateAssistant = null;
}
