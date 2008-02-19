#include <project.hjs>
#include <prio.hjs>

function CustombuttonsButton (uri)
{
	this. parse (uri);
}
CustombuttonsButton. prototype =
{
	doc: null,
	parameters: {},
	
	getText: function (nodeName)
	{
		var result = "";
		var node = this. doc. getElementsByTagName (nodeName) [0];
		if (!node)
			return result;
		if (node. firstChild && (node. firstChild. nodeType == node. TEXT_NODE))
			result = node. textContent;
		else // CDATA
			result = node. firstChild. textContent;
		return result;
	},
	
	parse: function (uri)
	{
		var button_code = unescape (uri);
		if (button_code. substring (0, 2) == "//")
			button_code = button_code. substring (2);
		values = {};
		if (button_code. indexOf ("<?xml ") == 0)
		{
			var xp = new DOMParser ();
			this. doc = xp. parseFromString (button_code, "text/xml");
			values. name	 = this. getText ("name");
			values. mode	 = this. getText ("mode");
			values. image	 = this. getText ("image");
			values. code	 = this. getText ("code");
			values. initCode = this. getText ("initcode");
			values. accelkey = this. getText ("accelkey");
		}
		else
		{
			var az = ["%5D%E2%96%B2%5B", "]\u00e2\u0096\u00b2[", "]▲[", "%5D%u25B2%5B"], idx = -1;
            for ( var i = 0; i < az.length; i++) {
                idx = (idx >= 0)? idx : ( button_code.indexOf(az[i]) > -1 )? i : idx ;
            } // End for
            sep = (idx >= 0)? az[idx] : "][";
            var ar =  button_code.split( sep );             // Split button
            if (ar.length == 5 || ar.length == 4 )
            {
                values. name	 = ar [0] || "";
                values. image	 = ar [1] || "";
                values. code	 = ar [2] || "";
                values. initCode = ar [3] || "";
                values. help     = ar [4] || "";
            }
            else {
                THROW ("Malformed custombuttons:// URI");
			}
			this. parameters = values;
		}
	}
};

function Custombuttons () {}
Custombuttons. prototype =
{
	ps: SERVICE (PREF). getBranch ("custombuttons.button"),
	buttonParameters: ["name", "image", "code", "initCode", "accelkey", "help"],
	buttonsLoadedFromProfileOverlay: null,
	button: null,
	values: null,
	toolbar: null,
	_palette: null,
	get palette ()
	{
		if (!this. _palette)
			this. _palette = this. getPalette ();
		return this. _palette;
	},
	
	getPalette: function ()
	{
		var gToolbox = ELEMENT ("navigator-toolbox") || // FF3b2 and lower
		ELEMENT ("browser-toolbox");	 // FF3b3pre and higher
		return gToolbox. palette;
	},
	
	getButtonParameters: function (num)
	{ //using for compatibility with older format
		try
		{
			var data = this. ps. getComplexValue (num, CI. nsISupportsString). data;
			var button = new CustombuttonsButton (data);
			return button. parameters;
	} catch (err) {}
	return false;
	},
	
	isCustomizableToolbar: function (aElt)
	{ //using for compatibility with older format
		return (aElt. localName == "toolbar") &&
		(aElt. getAttribute ("customizable") == "true");
	},
	
	getButtonsPlacesOnToolbars: function ()
	{ //using for compatibility with older format
		var toolbars = this. getToolbars ();
		var places = new Array ();
		for (var i = 0; i < toolbars. length; i++)
		{
			var toolbar = toolbars [i];
			var currentSet = toolbar. getAttribute ("currentset");
			//BEGIN AIOS - нахождение currentSet для binding-панелей слева и справа от tabbar
			if (toolbar. getAttribute ("anonymous") == "true")
			{
				var attr = "_toolbar_currentset_" +
				toolbar. getAttribute ("anonid");
				currentSet = document. documentElement. getAttribute (attr);
			}
			//END AIOS
			
			var ar = currentSet. split (",");
			var last = ar. pop ();
			var z = 0;
			for (var j = 0; j < ar. length; j++)
			{
				if (ar [j]. indexOf ("custombuttons-button") != -1)
					places. push ([toolbar, ar [j], z]);
				else
					z++;
			}
			if (last. indexOf ("custombuttons-button") != -1)
			{
				var pos = null;
				//BEGIN AIOS bug с пропаданием кнопок в статусбаре (из-за aios-bmbugfix в AIOS)
				if ((toolbar. id == "aiostbx-toolbar-statusbar-right") &&
					(toolbar. lastChild. id == "aiostbx-bmbugfix"))
				pos = toolbar. childNodes. length - 1;
				//END AIOS
				places. push ([toolbar, last, pos]);
			}
		}
		return places;
	},
	
	makeButtons: function ()
	{ //using for compatibility with older format AND for Initialization
		var numbers = this. ps. getChildList ("", {});
		if (numbers. length > 0)
		{
			dump ('\nfound buttons in prefs.js...');
			var buttons = new Object ();
			for (var i = 0; i < numbers. length; i++)
			{
				var values = this. getButtonParameters (numbers [i]);
				var button = this. getButtonById (numbers [i]);
				if (values && !button)
				{
					var newButton = this. createButton (numbers [i], values);
					buttons [newButton. id] = newButton;
				}
			}
			for (var but in buttons)
				this. palette. appendChild (buttons [but]);
			var places = this. getButtonsPlacesOnToolbars ();
			for (var i = places. length - 1; i >= 0; i--)
			{
				var nowButtonNum = this. getNumber (places [i] [1]);
				if (nowButtonNum)
				{
					var aBefore = places [i] [0]. childNodes [places [i] [2]];
					var values = this. getButtonParameters (nowButtonNum);
					var newButton = this. createButton (nowButtonNum, values);
					this. insertToToolbar (places [i] [0], newButton, aBefore);
				}
			}
			//deleting buttons from prefs.js, now they would be saved in the profile
			for (var i = 0; i < numbers. length; i++)
			{
				dump ("\ndeleting button #" + i);
				this. ps. deleteBranch (numbers [i]);
			}
			this. saveButtonsToProfile ();
		}
		//reinit buttons that for some reasons were not initialized in xbl
		this. reInitializeButtons ();
	},
	
	getButtonById: function (id)
	{
		var id2 = (isFinite (id)? "custombuttons-button": "") + id;
		return this. palette. getElementsByAttribute ("id", id2) [0] || null;
	},
	
	createButton: function (num, values)
	{ //updated
		var oItem = null;
		for (var i = 0; i < this. palette. childNodes. length; i++)
			if (this. palette. childNodes [i]. id == "custombuttons-template-button")
			{
				var cbpb = this. palette. childNodes [i];
				oItem = cbpb. cloneNode (true);
				break;
			}
			if (!oItem)
				oItem = document. createElement ("toolbarbutton");
			oItem. className = "toolbarbutton-1 chromeclass-toolbar-additional";
			oItem. setAttribute ("context", "custombuttons-contextpopup");
			oItem. setAttribute ("id", "custombuttons-button" + num);
			oItem. setAttribute ("label", values. name || "");
			oItem. setAttribute ("tooltiptext", values. name || "");
			if (values. image && values. image. length != -1)
				oItem. setAttribute ("image", values. image);
			if (values. mode)
				oItem. setAttribute ("cb-mode", values. mode);
			if (values. accelkey)
				oItem. setAttribute ("cb-accelkey", values. accelkey);
			var code = values. code || "";
			var initCode = values. initCode || "";
			var Help = values. help || "";
			oItem. setAttribute ("cb-oncommand", code);
			oItem. setAttribute ("cb-init", initCode);
			oItem. setAttribute ("Help", Help);
			return oItem;
	},
	
	getToolbars: function ()
	{ //used.
		var toolbars = new Array;
		var main_toolbars = document. getElementsByTagName ("toolbar");
		for (var i = 0; i < main_toolbars. length; i++)
			if (this. isCustomizableToolbar (main_toolbars [i]))
			toolbars. push (main_toolbars [i]);
		
		//BEGIN AIOS binding toolbars
		//added support for tbx 15.06.2006
		var aiostbx_bindingBoxes = new Array
		(
			"aiostbx-tableft-toolbox",
			"aiostbx-tabright-toolbox",
			"aiostbx-belowtabs-toolbox",
			"tbx-tableft-toolbox",
			"tbx-tabright-toolbox",
			"tbx-belowtabs-toolbox"
			);
		var aios_toolbox;
		for (var i = 0; i < aiostbx_bindingBoxes. length; i++)
		{
			aios_toolbox = ELEMENT (aiostbx_bindingBoxes [i]);
			if (aios_toolbox)
			{
				var children = aios_toolbox. childNodes;
				for (var j = 0; j < children. length; j++)
					if (this. isCustomizableToolbar (children [j]))
					toolbars. push (children [j]);
			}
		}
		//END AIOS belowtabs toolbars
		
		return toolbars;
	},
	
	insertToToolbar: function (toolbar, newItem, aBeforeElt)
	{ //checked-used
		if (aBeforeElt)
			toolbar. insertBefore (newItem, aBeforeElt);
		else
			toolbar. appendChild (newItem);
	},
	
	reInitializeButtons: function ()
	{
		for (var j = 0; j < this. palette. childNodes. length; j++)
		{
			var id = this. palette. childNodes [j]. getAttribute ("id");
			if (id. indexOf ("custombuttons-button") != -1)
			{
				var tbButton = ELEMENT (id);
				if (tbButton && !tbButton. hasAttribute ("initialized"))
					tbButton. init ();
			}
		}
	},
	
	init: function ()
	{
		var pref = "settings.editor.showApplyButton";
		var ps = SERVICE (PREF);
		ps = ps. QI (nsIPrefBranch);
		var cbps = ps. getBranch ("custombuttons.");
		var mode = cbps. getIntPref ("mode");
		if (ps. prefHasUserValue (pref))
		{
			mode |= (ps. getBoolPref (pref)? CB_MODE_SHOW_APPLY_BUTTON: 0);
			try
			{
				ps. deleteBranch (pref);
			}
			catch (e) {}
		}
		cbps. setIntPref ("mode", mode);
		setTimeout ("custombuttons.makeButtons()", 200);
	},
	
	buttonConstructor: function (oBtn)
	{
		var cbd = SERVICE (CB_KEYMAP);
		cbd. Delete (oBtn. getAttribute ("id"));
		if (oBtn. hasAttribute ("cb-accelkey"))
		{
			cbd. Add
			(
				oBtn. getAttribute ("id"),
				oBtn. getAttribute ("cb-accelkey"),
				(oBtn. cbMode & CB_MODE_DISABLE_DEFAULT_KEY_BEHAVIOR)? true: false
			);
		}
		if (oBtn. hasAttribute ("cb-oncommand"))
			oBtn. cbCommand = oBtn. getAttribute ("cb-oncommand");
		if (oBtn. hasAttribute ("image"))
		{
			if (!oBtn. getAttribute ("image") ||
				(oBtn. getAttribute ("image") == "data:"))
			oBtn. removeAttribute ("image");
		}
		if (oBtn. hasAttribute ("Help"))
		{
			if (!oBtn. getAttribute ("Help"))
				oBtn. removeAttribute ("Help");
		}
		if (!oBtn. hasAttribute ("initialized"))
		{
			if (oBtn. hasAttribute ("cb-init"))
			{
				var ps = SERVICE (PREF). getBranch ("custombuttons.");
				var mode = ps. getIntPref ("mode");
				if ((oBtn. parentNode. nodeName != "toolbar") &&
					((mode & CB_MODE_DISABLE_INIT_IN_CTDIALOG_GLOBAL) ||
					!(oBtn. cbMode & CB_MODE_ENABLE_INIT_IN_CTDIALOG)))
				return;
				oBtn. cbInitCode = oBtn. getAttribute ("cb-init");
				oBtn. init ();
			}
			else
			{
				oBtn. setAttribute ("cb-init", "");
				oBtn. setAttribute ("initialized", "true");
			}
		}
	},
	buttonDestructor: function(oBtn)
	{
		if (this. hasAttribute ("cb-accelkey"))
		{
			var cbd = SERVICE (CB_KEYMAP);
			cbd. Delete (this. getAttribute ("id"));
		}
	},
	
	buttonCheckBind: function(oBtn)
	{
		if (Function. prototype. bind == undefined)
		{
			Function. prototype. bind = function (object)
			{
				var method = oBtn;
				return function ()
				{
					return method. apply (object, arguments);
				}
			}
		}
	},
	
	buttonInit: function(oBtn)
	{
		if (oBtn. cbInitCode)
		{
			while (oBtn. hasChildNodes ())
				oBtn. removeChild (oBtn. childNodes [0]);
			oBtn. checkBind ();
			try
			{
				(new Function (oBtn. cbInitCode)). apply (oBtn);
			}
			catch (e)
			{
				var msg = "Custom Buttons error.]" +
				"[ Event: Initialization]" +
				"[ Button name: " +
				oBtn. getAttribute ("label") +
				"]" +
				"[ Button ID: " +
				oBtn. getAttribute ("id") +
				"]" +
				"[ " +
				e;
				THROW (msg);
			}
		}
		oBtn. setAttribute ("initialized", "true");
	},
	
	buttonGetParameters: function(oBtn)
	{
		return {
			name:		oBtn. name,
			image:		oBtn. image,
			code:		oBtn. cbCommand,
			initCode:	oBtn. cbInitCode,
			accelkey:	oBtn. cbAccelKey,
			mode:		oBtn. cbMode,
			Help:		oBtn. Help
		};
	},
	
	buttonGetCbAccelKey: function(oBtn)
	{
		if (oBtn. hasAttribute ("cb-accelkey"))
			return oBtn. getAttribute ("cb-accelkey");
		return "";
	},
	
	buttonGetImage: function(oBtn)
	{
		if (oBtn. hasAttribute ("image"))
			return oBtn. getAttribute ("image");
		return "";
	},
	
	buttonGetHelp: function(oBtn)
	{
		if (oBtn. hasAttribute ("Help"))
			return oBtn. getAttribute ("Help");
		return "";
	},
	
	buttonGetCbMode: function(oBtn)
	{
		if (oBtn. hasAttribute ("cb-mode"))
			return oBtn. getAttribute ("cb-mode");
		return 0;
	},
	
	buttonGetOldFormatURI: function(oBtn)
	{
		var uri = "custombutton://" + escape
		(
			[
				oBtn. name,
				oBtn. image,
				oBtn. cbCommand,
				oBtn. cbInitCode
			]. join ("][")
		);
		return uri;
	},
	
	buttonGetMidFormatURI: function(oBtn)
	{
		var uri = "custombutton://" + escape
		(
			[
				oBtn. name,
				oBtn. image,
				oBtn. cbCommand,
				oBtn. cbInitCode
			]. join ("]▲[")
			);
		return uri;
	},
	
	buttonSetText: function(doc, nodeName, text, make_CDATASection)
	{
		var node = doc. getElementsByTagName (nodeName) [0], cds;
		if (!node)
			return;
		if (make_CDATASection)
		{
			cds = doc. createCDATASection (text || "");
			node. appendChild (cds);
		}
		else
		{
			node. textContent = text;
		}
	},
	
	
	buttonGetXmlFormatURI: function(oBtn)
	{
		var doc = document. implementation. createDocument ("", "", null);
		doc. async = false;
		doc. load ("chrome://custombuttons/content/nbftemplate.xml");
		oBtn. setText (doc, "name",		oBtn. name, false);
		oBtn. setText (doc, "mode",		oBtn. cbMode, false);
		oBtn. setText (doc, "image",	oBtn. image, true);
		oBtn. setText (doc, "code",		oBtn. cbCommand, true);
		oBtn. setText (doc, "initcode",	oBtn. cbInitCode, true);
		oBtn. setText (doc, "accelkey",	oBtn. cbAccelKey, true);
		oBtn. setText (doc, "help",		oBtn. Help, true);
		var ser = new XMLSerializer ();
		var data = ser. serializeToString (doc);
		return "custombutton://" + escape (data);
	},
	
	buttonGetURI: function (oBtn)
	{
		var ps = Components. classes ["@mozilla.org/preferences-service;1"].
		getService (Components. interfaces. nsIPrefService).
		getBranch ("custombuttons.");
		if (ps. getIntPref ("mode") && CB_MODE_USE_XML_BUTTON_FORMAT)
			return this. xmlFormatURI (oBtn);
		else
			return this. midFormatURI (oBtn);
	},
	
	buttonCbExecuteCode: function(oBtn)
	{
		if (oBtn. cbCommand)
		{
			oBtn. checkBind ();
			(new Function (oBtn. cbCommand)). apply (oBtn);
		}
	},
	
	// TODO: check for code evaluation construction. Carefully check.
	buttonCommand: function(event, oBtn)
	{
		if (oBtn. cbCommand)
		{
			alert(event.target.id);
			var code = "var event = arguments[0];\n";
			code += oBtn. cbCommand;
			oBtn. checkBind ();
			(new Function (code)). apply (oBtn, arguments);
		}
	},
	
	openButtonDialog: function (editDialogFlag)
	{
		openDialog
		(
			"chrome://custombuttons/content/edit.xul",
			"custombuttons-edit",
			"chrome,resizable,dependent,dialog=no",
			editDialogFlag? document. popupNode: null
		);
	},
	
	editButton: function ()
	{
		this. openButtonDialog (true);
	},
	
	addButton: function ()
	{
		this. openButtonDialog (false);
	},
	
	prepareButtonOperation: function ()
	{
		this. button = document. popupNode;
		this. values = this. button. parameters;
		this. toolbar = this. button. parentNode;
	},
	
	finalizeButtonOperation: function (newButtonId)
	{
		//Исправляем currentSet для toolbar
		var repstr = "";
		if (newButtonId)
			repstr = this. button. id + "," + newButtonId;
		var cs = this. toolbar. getAttribute ("currentset");
		var ar = cs. split (this. button. id);
		cs = ar. slice (0, 2). join (repstr);
		if (ar. length > 2)
			cs = cs + ar. slice (2). join ("");
		cs = cs. replace (/^,/, "");
		cs = cs. replace (/,,/g, ",");
		cs = cs. replace (/,$/, "");
		this. toolbar. setAttribute ("currentset", cs);
		document. persist (this. toolbar. id, "currentset");
		
		//если это custom-toolbar, то исправляем атрибуты в toolbarSet...
		var customindex = this. toolbar. getAttribute ("customindex");
		if (customindex > 0)
		{
			var attrName = "toolbar" + customindex;
			var toolbarSet = ELEMENT ("customToolbars");
			var oldSet = toolbarSet. getAttribute (attrName);
			cs = oldSet. substring (0, oldSet. indexOf (":") + 1) + cs;
			toolbarSet. setAttribute (attrName, cs);
			document. persist ("customToolbars", attrName);
		}
		//Исправления для AIOS
		if (ELEMENT ("aiostbx-belowtabs-toolbox"))
			persistCurrentSets ();
		this. saveButtonsToProfile ();
	},
	
	removeButton: function ()
	{
		this. prepareButtonOperation ();
		var str = CB_STRING ("cbStrings", "RemoveConfirm", this. values. name);
		var buts = this. palette. childNodes;
		if (confirm (str))
		{
			var but = this. getButtonById (this. button. id);
			if (but)
				this. palette. removeChild (but);
			this. toolbar. removeChild (this. button);
			this. finalizeButtonOperation (null);
		}
	},
	
	cloneButton: function ()
	{
		this. prepareButtonOperation ();
		var newNum = this. min_button_number ();
		var newButton = this. createButton (newNum, this. values);
		var newButton2 = this. createButton (newNum, this. values);
		var newButtonId = newButton. id;
		this. palette. appendChild (newButton2);
		var aBefore = this. button. nextSibling;
		this. insertToToolbar (this. toolbar, newButton, aBefore);
		this. finalizeButtonOperation (newButtonId);
	},
	
	copyURI: function ()
	{ //checked
		SERVICE (CLIPBOARD_HELPER). copyString (document. popupNode. URI);
	},
	
	getNumber: function (id)
	{ //checked
		if (id. indexOf ("custombuttons-button") != -1)
			return id. substring ("custombuttons-button". length);
		return "";
	},
	
	min_button_number: function ()
	{ //updated
		var bt = new Object ();
		var buts = this. palette. childNodes;
		var butscount = buts. length;
		var n, id;
		for (var j = 0; j < butscount; j++)
		{
			id = buts [j]. getAttribute ("id");
			n = this. getNumber (id);
			if (n)
				bt [n] = true;
		}
		var z = 0;
		while (typeof bt [z] != "undefined")
			z++;
		return z;
	},
	
	setButtonParameters: function (num, values)
	{ //updated
		if (num) // edit button
		{
			//заменяем button в Palette и на панели на обновленную
			var newButton = this. createButton (num, values);
			var newButton2 = this. createButton (num, values);
			var buts;
			//toolbar
			buts = document. getElementsByAttribute ("id", newButton2. id);
			if (buts [0])
				buts [0]. parentNode. replaceChild (newButton2, buts [0]);
			//palette
			buts = this. getButtonById (newButton. id);
			if (buts)
				buts. parentNode. replaceChild (newButton, buts);
		}
		else // install web button or add new button
		{ //checked
			num = this. min_button_number ();
			var newButton = this. createButton (num, values);
			/*вставляем button в Palette и выдаем алерт об успешном создании*/
			//palette
			this. palette. appendChild (newButton);
			var str = GET_STRING ("cbStrings", "ButtonAddedAlert");
			alert (str);
		}
		this. saveButtonsToProfile ();
	},
	
	installWebButton: function (uri)
	{ //checked
		try
		{
			var button = new CustombuttonsButton (uri);
		}
		catch (err)
		{
			var str = GET_STRING ("cbStrings", "ButtonErrors");
			alert (str);
			return false;
		}
		var str = CB_STRING ("cbStrings", "InstallConfirm", button. parameters. name);
		if (confirm (str))
			this. setButtonParameters (null, button. parameters);
		return true;
	},
	
	execute_oncommand_code: function (code, button)
	{ //checked
		var x = new Function (code);
		x. apply (button);
	},
	
	saveButtonsToProfile: function ()
	{
		var doc;
		doc = this. makeOverlay ("BrowserToolbarPalette");
		this. saveOverlayToProfile (doc, "buttonsoverlay.xul");
	},
	
	makeOverlay: function (paletteId)
	{
		var doc = document. implementation. createDocument ("", "", null);
		doc. async = false;
		doc. load ("chrome://custombuttons/content/buttonsoverlay.xul");
		var palette = doc. getElementById (paletteId);
		var copiedAttributes =
		{
			"class"		   : true,
			"id"		   : true,
			"label"		   : true,
			"image"		   : true,
			"cb-oncommand" : true,
			"cb-init"	   : true,
			"cb-mode"	   : true,
			"cb-accelkey"  : true,
			"context"	   : true,
			"tooltiptext"  : true,
			"Help"		   : true
		};
		
		//adding buttons from palette to new doc
		for (var j = 0; j < this. palette. childNodes. length; j++)
		{
			var but = this. palette. childNodes [j];
			if (but. getAttribute ("id"). indexOf ("custombuttons-button") != -1)
			{
				var newButton = doc. createElement (but. nodeName);
				for (a in copiedAttributes)
				{
					if (but. hasAttribute (a))
						newButton. setAttribute (a, but. getAttribute (a));
				}
				palette. appendChild (newButton);
			}
		}
		return doc;
	},
	
	saveOverlayToProfile: function (doc, fileName)
	{
		var serializer = new XMLSerializer ();
		var data = serializer. serializeToString (doc);
		
		//beautifull output
		XML. prettyPrinting = true;
		data = (new XML (data)). toXMLString ();
		
		var uniConv = COMPONENT (SCRIPTABLE_UNICODE_CONVERTER);
		uniConv. charset = "utf-8";
		data = uniConv. ConvertFromUnicode (data);
		
		var dir = SERVICE (PROPERTIES). get ("ProfD", CI. nsIFile); // get profile folder
		dir. append ("custombuttons");
		if (!dir. exists ())
		{
			try
			{
				dir. create (DIRECTORY_TYPE, 0755);
			}
			catch (e)
			{
				var msg = 'Custom Buttons error.]' +
				'[ Event: Creating custombuttons directory]' +
				'[ ' + e;
				Components. utils. reportError (msg);
			}
		}
		
		var file = dir. clone ();
		file. append (fileName);
		if (file. exists ())
		{
			//creating backup
			var backupfile = dir. clone ();
			var backupfileName = fileName + ".bak";
			backupfile. append (backupfileName);
			if (backupfile. exists ())
				backupfile. remove (false);
			file. copyTo (dir, backupfileName);
		}
		
		var foStream = COMPONENT (FILE_OUTPUT_STREAM);
		var flags = PR_WRONLY | PR_CREATE_FILE | PR_TRUNCATE;
		foStream. init (file, flags, 0664, 0);
		foStream. write (data, data. length);
		foStream. close ();
	},
	
	_eventKeymap: [],
	getKey: function (event)
	{
		if (event. which)
			return String. fromCharCode (event. which);
		if (this. _eventKeymap. length == 0)
		{
			var prefix = "DOM_VK_";
			for (i in event)
				if (i. indexOf (prefix) == 0)
				this. _eventKeymap [event [i]] = i. substr (prefix. length);
		}
		return this. _eventKeymap [event. keyCode];
	},
	
	onKeyPress: function (event)
	{
		var prefixedKey = "";
		if (event. altKey) prefixedKey += "Alt+";
		if (event. ctrlKey) prefixedKey += "Ctrl+";
		if (event. shiftKey) prefixedKey += "Shift+";
		var key = this. getKey (event);
		prefixedKey += key;
		if ((key == "TAB") || (prefixedKey == "ESCAPE"))
			return;
		var cbd = SERVICE (CB_KEYMAP);
		var lenobj = {};
		var ids = cbd. Get (prefixedKey, lenobj);
		if (ids. length == 0)
			return;
		var mode = (ids. shift () == "true");
		if (mode)
		{
			event. stopPropagation ();
			event. preventDefault ();
		}
		for (var i = 0; i < ids. length; i++)
		{
			try
			{
				ELEMENT (ids [i]). cbExecuteCode ();
			}
			catch (e) {}
		}
	},
	
	handleEvent: function (event)
	{
		switch (event. type)
		{
		case "load":
			this. init ();
			break;
		case "unload":
			this. saveButtonsToProfile ();
			window. removeEventListener ("load", custombuttons, false);
			window. removeEventListener ("unload", custombuttons, false);
			window. removeEventListener ("keypress", custombuttons, true);
			break;
		case "keypress":
			this. onKeyPress (event);
			break;
		default:
			break;
		}
	}
};

function TBCustombuttons () {}
TBCustombuttons. prototype =
{
    getPalette: function ()
	{
		var gToolbox = ELEMENT ("mail-toolbox") ||	// main window and message window
		ELEMENT ("compose-toolbox"); // compose message
		return gToolbox. palette;
	},
	
	saveButtonsToProfile: function ()
	{
		var doc;
		doc = this. makeOverlay ("MailToolbarPalette");
		this. saveOverlayToProfile (doc, "buttonsoverlay.xul");
		doc = this. makeOverlay ("MsgComposeToolbarPalette");
		this. saveOverlayToProfile (doc, "mcbuttonsoverlay.xul");
	}
};
EXTEND (TBCustombuttons, Custombuttons);

var custombuttons = new custombuttonsFactory (). Custombuttons;

/**  Object gClipboard
 Author:  George Dunham aka: SCClockDr
 Date:    2007-02-11
 Scope:    Public
 Properties:
    sRead - An array which holds the local clipboard data.
 Methods:
    write - Stuffs data into the system clipboard.
    clear - Clears the system clipboard.
    Clear - Clears the local clipboard.
    read - Retrieves the system clipboard data.
    Write - Stuffs data into the local clipboard.
    Read - Retrieves the local clipboard data.
 Purpose:  1. Provide a simple means to access the system clipboard
    2. Provid an alternate clipboard for storing a buffer of
       copied strings.
 TODO:    1. gClipboard.ClearHist sets sRead.length to 0
 TODO:    2. gClipboard.History offers a context menu of up to 10 past clips to paste
 TODO:    3. gClipboard.SystoI adds the sys Clipboard to the internal clipboard

**/
var gClipboard = { //{{{
 // Properties:
 sRead:new Array(),
 // Methods
 /**  write( str )

  Scope:    public
  Args:    sToCopy
  Returns:  Nothing
  Called by:  1. Any process wanting to place a string in the clipboard.
  Purpose:  1.Stuff and Retrieve data from the system clipboard.
  UPDATED:  9/18/2007 Modified to conform to the MDC suggested process.
 **/
 write:function ( sToCopy ) //{{{
 {
   if (sToCopy != null){            // Test for actual data
     var str  = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
     str.data = sToCopy;
     var trans = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Components.interfaces.nsITransferable);
     trans.addDataFlavor("text/unicode");
     trans.setTransferData("text/unicode", str, sToCopy.length * 2);
     var clipid = Components.interfaces.nsIClipboard;
     var clip   = Components.classes["@mozilla.org/widget/clipboard;1"].getService(clipid);
     clip.setData(trans, null, clipid.kGlobalClipboard);
   } // End if (str != null)
 }, //}}} End Method write( str )

 /**  clear(  )

  Scope:    public
  Args:
  Returns:  Nothing
  Called by:
     1. Any process wanting to clear the clipboard
  Purpose:
     1. Clear the system cllipboard
  TODO:
     1.
 **/
 clear:function (  ) //{{{
 {
   this.write("");
 }, //}}} End Method clear(  )
 /**  Clear(  )

  Scope:    public
  Args:
  Returns:  Nothing
  Called by:
     1. Any process wanting to clear the local clipboard
  Purpose:
     1. Clear the local cllipboard
  TODO:
     1.
 **/
 Clear:function (  ) //{{{
 {
   this.sRead[0] = "";
 }, //}}} End Method Clear(  )
 /**  read(  )

  Scope:    public
  Args:
  Returns:  sRet
  Called by:
     1.
  Purpose:
     1.
  TODO:
     1.
 **/
 read:function (  ) //{{{
 {
   var str       = new Object();
   var strLength = new Object();
   var pastetext = null;
   var clip  = Components.classes["@mozilla.org/widget/clipboard;1"].getService(Components.interfaces.nsIClipboard);
   if (!clip) return pastetext;
   var trans = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Components.interfaces.nsITransferable);
   if (!trans) return pastetext;
   trans.addDataFlavor("text/unicode");
   clip.getData(trans, clip.kGlobalClipboard);
   trans.getTransferData("text/unicode", str, strLength);
   if (str) str       = str.value.QueryInterface(Components.interfaces.nsISupportsString);
   if (str) pastetext = str.data.substring(0, strLength.value / 2);
   return pastetext;
 }, //}}} End Method read(  )

 /**  Write( str )

  Scope:    public
  Args:    str
  Returns:  Nothing
  Called by:
     1.
  Purpose:
     1.
  TODO:
     1.
 **/
 Write:function ( str ) //{{{
 {
   this.sRead[0] = str;
 }, //}}} End Method Write( str )

 /**  Read(  )

  Scope:    public
  Args:
  Returns:  sRet
  Called by:
     1.
  Purpose:
     1.
  TODO:
     1.
 **/
 Read:function (  ) //{{{
 {
   var sRet = this.sRead[0];
   return sRet;
 } //}}} End Method Read(  )

}; //}}} End Object gClipboard

window. addEventListener ("load", custombuttons, false);
window. addEventListener ("unload", custombuttons, false);
window. addEventListener ("keypress", custombuttons, true);
