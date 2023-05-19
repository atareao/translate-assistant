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
const SHORTCUT_SETTING_KEY = "keybinding-translate-clipboard";


var TranslateAssistant = GObject.registerClass(
    class TranslateAssistant extends PanelMenu.Button{
        _init(){
            super._init(St.Align.START);
            this._settings = ExtensionUtils.getSettings();

            /* Icon indicator */
            let box = new St.BoxLayout();
            this.icon = new St.Icon({style_class: 'system-status-icon'});
            box.add(this.icon);
            this.add_child(box);

            this.autoCopySwitch = new PopupMenu.PopupSwitchMenuItem(_('Auto Copy'),
                                                                    {active: false})
            this.menu.addMenuItem(this.autoCopySwitch)
            this.autoCopySwitch.connect('toggled', () => {
                this._set_icon_indicator();
            });
            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(this._menuInput());
            this.menu.addMenuItem(this._menuIcons());
            this.menu.addMenuItem(this._menuOutput());

            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            /* Setings */
            this.settingsMenuItem = new PopupMenu.PopupMenuItem(_("Settings"));
            this.settingsMenuItem.connect('activate', () => {
                ExtensionUtils.openPrefs();
            });
            this.menu.addMenuItem(this.settingsMenuItem);
            /* Init */
            this._set_icon_indicator();
            this._settingsChanged();
            this._settings.connect('changed', ()=>{
                this._settingsChanged();
            });
        }

        _loadPreferences(){
            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));
            this._split_sentences = this._getValue('split-sentences');
            this._preserve_formatting = this._getValue('preserve-formatting');
            this._formality = this._getValue('formality');
            this._url = this._getValue('url');
            this._apikey = this._getValue('apikey');
            this._keybinding_translate_clipboard = this._getValue(SHORTCUT_SETTING_KEY);
            log(this._keybinding_translate_clipboard);
            this._notifications = this._getValue('notifications');
            this._darktheme = this._getValue('darktheme');

            this._set_icon_indicator();
            this._unbindShortcut();
            this._bindShortcut();
        }

        _bindShortcut(){
            Main.wm.addKeybinding(SHORTCUT_SETTING_KEY,
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
            Clipboard.get_text(CLIPBOARD_TYPE,(_, fromText) => {
                if(fromText && fromText !== ""){
                    let split_sentences = this._split_sentences?"1":"0";
                    let preserve_formatting = this._preserve_formatting?"1":"0";
                    let params = {
                        auth_key: this._apikey,
                        text: fromText,
                        source_lang: this._source_lang,
                        target_lang: this._target_lang,
                        split_sentences: split_sentences,
                        preserve_formatting: preserve_formatting,
                        formality: this._formality,
                    };
                    let message = Soup.Message.new_from_encoded_form(
                        'POST',
                        this._url,
                        Soup.form_encode_hash(params)
                    );
                    let session = new Soup.Session();

                    session.send_and_read_async(
                        message,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (session, result) => {
                            if(message.get_status() === Soup.Status.OK) {
                                try {
                                    if(result){
                                        let bytes = session.send_and_read_finish(result);
                                        let decoder = new TextDecoder("utf-8");
                                        let response = decoder.decode(bytes.get_data());
                                        let json = JSON.parse(response);
                                        let translations = json.translations;
                                        let toText = null;
                                        if (translations.length > 0){
                                            toText = translations[0].text;
                                        }else{
                                            toText = "";
                                        }
                                        this._update(fromText, toText);
                                    }
                                } catch(e) {
                                    Main.notify("Translate Assistant", `Error: ${e}`);
                                }
                            }else{
                                if(message.status_code == 403){
                                    Main.notify("Translate Assistant", _("Set API Key of DeepL"));
                                }else{
                                    const code = message.status_code;
                                    Main.notify("Translate Assistant", `Error: ${code}`);
                                }
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
            return null;
        }

        _update(from_text, to_text){
            this.inputEntry.get_clutter_text().set_text(from_text);
            this.outputEntry.get_clutter_text().set_text(to_text);
            if(this._notifications){
                Main.notify("Translate Assistant", _("Translated"));
            }
            if(this.autoCopySwitch._switch.state){
                Clipboard.set_text(CLIPBOARD_TYPE, to_text);
            }
        }

        _menuIcons(){
            let box = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                trackHover: false,
                canFocus: false
            });
            let buttonPasteFromClipboard = new St.Button({
                label:_("Paste"),
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonPasteFromClipboard.connect('clicked', ()=>{
                Clipboard.get_text(CLIPBOARD_TYPE,(_, fromText) => {
                    if(fromText && fromText !== ""){
                        this.inputEntry.get_clutter_text().set_text(fromText);
                    }
                });
            });
            box.add_child(buttonPasteFromClipboard);
            let buttonTranslate = new St.Button({
                label: _("Translate"),
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonTranslate.connect('clicked', ()=>{
                let from_text = this.inputEntry.get_clutter_text().get_text();
                if(from_text && from_text !== ""){
                    Clipboard.set_text(CLIPBOARD_TYPE, from_text);
                    this._translate();
                }
            });
            box.add_child(buttonTranslate);
            let buttonCopyToClipboard = new St.Button({
                label:_("Copy"),
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonCopyToClipboard.connect('clicked', ()=>{
                let to_text = this.outputEntry.get_clutter_text().get_text();
                if(to_text && to_text !== ""){
                    Clipboard.set_text(CLIPBOARD_TYPE, to_text);
                }
            });
            box.add_child(buttonCopyToClipboard);
            let iconsMenuItem = new PopupMenu.PopupBaseMenuItem({});
            iconsMenuItem.add_child(box);
            return iconsMenuItem;
        }

        _menuInput(){
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
            let box = new St.BoxLayout({
                vertical: true,
            });
            box.add_child(this.inputEntry);
            let scroll = new St.ScrollView({
                width: 300,
                height: 300
            });
            scroll.add_actor(box);
            this.menuInputExpander = new PopupMenu.PopupSubMenuMenuItem(_("From"));
            this.menuInputExpander.menu.box.add(scroll);
            return this.menuInputExpander;
        }

        _menuOutput(){
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
            let box = new St.BoxLayout({
                vertical: true,
            });
            box.add_child(this.outputEntry);
            let scroll = new St.ScrollView({
                width: 300,
                height: 300
            });
            scroll.add_actor(box);
            this.menuOutputExpander = new PopupMenu.PopupSubMenuMenuItem(_("To"));
            this.menuOutputExpander.menu.box.add(scroll);
            return this.menuOutputExpander;
        }

        _getValue(keyName){
            return this._settings.get_value(keyName).deep_unpack();
        }

        _set_icon_indicator(){
            let active = this.autoCopySwitch._switch.state;
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

        destroy(){
            this._unbindShortcut();
            super.destroy();
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
    translateAssistant.destroy();
    translateAssistant = null;
}
