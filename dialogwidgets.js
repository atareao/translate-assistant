import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// The extension object is registered only after prefs.js is imported,
// so look it up lazily; GType names need the uuid at module load.
const Extension = {
    uuid: 'translate-assistant@atareao.es',
    get metadata() {
        return ExtensionPreferences.lookupByURL(import.meta.url).metadata;
    },
    get path() {
        return ExtensionPreferences.lookupByURL(import.meta.url).path;
    },
};

export const KeyValueDialog = GObject.registerClass(
    {
        GTypeName: (Extension.uuid + '.KeyValueDialog').replace(/[\W_]+/g,'_')
    },
    class EntryDialog extends Gtk.Dialog{
        _init(parent, title, keyLabel, valueLabel, key="", value=""){
            super._init({
                title: title,
                transientFor: parent.get_root(),
                modal: true,
                use_header_bar: true
            });
            let grid = new Gtk.Grid({
                marginTop: 10,
                marginBottom: 10,
                marginStart: 10,
                marginEnd:10,
                columnSpacing: 20,
                rowSpacing: 20,
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.CENTER
            });
            grid.insert_after(this.get_content_area(), null);

            let label1 = new Gtk.Label({
                halign: Gtk.Align.START,
                label: keyLabel
            });
            grid.attach(label1, 0, 0, 1, 1);
            this._entry1 = new Gtk.Entry({
                text: key
            });
            grid.attach(this._entry1, 1, 0, 1, 1);

            let label2 = new Gtk.Label({
                halign: Gtk.Align.START,
                label: valueLabel
            });
            grid.attach(label2, 0, 1, 1, 1);
            this._entry2 = new Gtk.Entry({
                text: value
            });
            grid.attach(this._entry2, 1, 1, 1, 1);

            this.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
            this.add_button(_('Ok'), Gtk.ResponseType.OK);
        }

        getKey(){
            return this._entry1.get_text();
        }
        setKey(key){
            this._entry1.set_text(key);
        }
        getValue(){
            return this._entry2.get_text();
        }
        setValue(value){
            this._entry2.set_text(value);
        }
    }
);
