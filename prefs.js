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

const {GLib, GObject, Gio, Gtk, Gdk} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const Widgets = Extension.imports.preferenceswidget;
const AboutPage = Extension.imports.aboutpage.AboutPage;
const Gettext = imports.gettext.domain(Extension.uuid);
const _ = Gettext.gettext;

const DialogWidgets = Extension.imports.dialogwidgets;

function init() {
    ExtensionUtils.initTranslations();
}

var TranslateAssistantPreferencesWidget = GObject.registerClass(
    class TranslateAssistantPreferencesWidget extends Widgets.ListWithStack{
        _init(){
            super._init({});

            let preferencesPage = new Widgets.Page();

            var settings = ExtensionUtils.getSettings();

            let indicatorSection = preferencesPage.addFrame(
                _("Indicator options"));
            indicatorSection.addWidgetSetting(
                settings,
                "source-lang",
                new Widgets.EnumSetting(settings, "source-lang"));
            indicatorSection.addWidgetSetting(
                settings,
                "target-lang",
                new Widgets.EnumSetting(settings, "target-lang"));
            indicatorSection.addGSetting(settings, "split-sentences");
            indicatorSection.addGSetting(settings, "preserve-formatting");
            indicatorSection.addWidgetSetting(
                settings,
                "formality",
                new Widgets.EnumSetting(settings, "formality"));
            indicatorSection.addGSetting(settings, "url");
            indicatorSection.addGSetting(settings, "apikey");


            const themePage = new Widgets.Page();
            const styleSection = themePage.addFrame(_("Theme"));
            styleSection.addGSetting(settings, "notifications");
            styleSection.addGSetting(settings, "darktheme");
            styleSection.addWidgetSetting(
                settings,
                "keybinding-translate-clipboard",
                new Widgets.ShortcutSetting(settings,
                                            "keybinding-translate-clipboard"));

            this.add(_("Translate Assistant Preferences"),
                     "preferences-other-symbolic",
                     preferencesPage);
            this.add(_("Style"), "style", themePage);
            this.add(_("About"), "help-about-symbolic", new AboutPage());
        }
    }
);

function buildPrefsWidget() {
    let preferencesWidget = new TranslateAssistantPreferencesWidget();
    preferencesWidget.connect("realize", ()=>{
        const window = preferencesWidget.get_root();
        window.set_title(_("Translate Assistant Configuration"));
        window.default_height = 800;
        window.default_width = 850;
    });
    return preferencesWidget;
}
