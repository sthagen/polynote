# 0.3.12 (Sep 16, 2020)
* Fix an issue with Python Data Classes
* Fix issues importing Zeppelin notebooks
* Fix some dependency resolution bugs (Thanks @JD557)
* Fix an issue improperly decoding URI components (Thanks @akiyamaneko)
* Other minor bug fixes

# 0.3.11 (Jun 10, 2020)
* Fix a regression which stopped certain error types from appearing in the UI
* Check Notebook read permission when loading a notebook. 

# 0.3.10 (May 29, 2020)
* New experimental Dark Mode (feedback welcome!)
* Ability to directly paste images into text cells (image button on toolbar still doesn't do anything, but at least now it's possible to insert an image without it having to already have a URL)
* Notebooks are loaded incrementally (better responsiveness for large notebook files)
* Some tweaks/fixes for Scala completions and signature help
* Handle case when the browser generates continuation frames over the websocket

# 0.3.9 (May 18, 2020)
* Replaces `0.3.8`, which was retracted after we found a few issues in it that weren't caught. 
* **Stability** A bug that could cause data loss has been fixed in this release. 
* **Backups** Polynote now writes a write-ahead-log (WAL) whenever it gets updates to a notebook. This WAL can be recovered using `polynote.py recover /path/to/wal-file.wal`. This is currently experimental.
* **Backups** Polynote now saves a copy of opened notebooks into the browser's local database. This can be used in case of catastrophic server-side data loss (but where the client has been working). 
* **New** Added a "notebook runner", invoked with `polynote.py run [OPTIONS] input-file input-files*` that can run notebooks in headless mode 
* Lots of fixes to the Plot UI (Thanks @JD557!) 
* Handle naming collisions between Java and Python package imports. Python packages with JVM-like names no longer get swallowed by the Jep importer. 

# 0.3.7 (Apr 26, 2020)
* Fixed bug: saving plots doesn't work because websocket connection dies for no apparent reason
* Fixed bug: Value of zero or `false` causes `[object Object]` in table view... *sigh* javascript
* Fixed issue: Plotting pandas DataFrame fails when column identifiers have non-string type (thanks @Baoqi!)
* Configurable port range for remote kernel comms (thanks @hadrienk!)
* Parallel downloads of JVM dependencies
* Allow complex data structure display in table view
* Fixed some edge cases in Scala code that defines classes/types/methods and uses them in later cells

# 0.3.6 (Apr 1, 2020)
* Fixed regressions:
  * Cancel button not working
  * Rename active notebook causes bad state / data loss
  * Configured `listen` interface was ignored
  * Crash in SQL interpreter
  * JavaScript error when attempting parameter hints
* Fix issue with launcher script
* Fix multiple series in bar chart (Thanks @JD557!)
* Surface error if kernel dies before finishing startup

# 0.3.5 (Mar 26, 2020)
* Fixed plugin script
* Fixed avatar images in commenting UI (when identity supports them)
* Added configuration for a "default" spark props template
* Reverted bug in remote kernel logging

# 0.3.4 (Mar 25, 2020) 
* Switch HTTP server to https://github.com/polynote/uzhttp (this affects the `IdentityProvider.Service` interface)
* Update to ZIO 1.0.0-RC18-2 (this deprecates the `Enrich` macro)
* Front-end static files were moved out of the application JAR, so they can be served directly on disk. This changes the directory structure of the polynote installation by adding a `static` directory which contains the (gzipped) static files. These static files can now be served directly by a dedicated webserver if so desired.
* Write `language_info` metadata to ipynb files (improves interop with notebook tools)

# 0.3.3 (Mar 19, 2020)
* *Automatic conversion of PySpark <-> Spark DataFrames* - it no longer matters which language you used to create the DataFrame!
* *Comment support* Code cells only for now. Highlight some text in a code cell and you'll be able to add a comment, similar to Google Docs. 
* *Environment Variable Configuration* Requires isolated kernels. Can now set environment variables to be passed to the notebook process.
* Improvements to Pandas DataFrame support. 
* Add new `Run to cursor` hotkey - it's `Ctrl + Alt + F9`. Thanks @kuckjwi0928 !
* Added support for more IPython repr formats: Polynote now understands `_repr_svg_`, `_repr_jpeg_`, `_repr_png_`, and `_repr_mimebundle_`
* Improvement to autocomplete - it should now be higher quality and won't trigger for weird characters like `:`
* Python completion improvements: Function parameter hints should now have types, dictionaries now have key completions, 
  and `jedi` has been updated [for even more goodies](https://github.com/davidhalter/jedi/blob/master/CHANGELOG.rst#0160-2020-01-26)
* Fixed some more bugs in the Python interpreter
* Fix config number format issue. Thanks @bgparkerdev !
* A bunch of other fixes and improvements!

# 0.3.2 (Feb 21, 2020)
* Fix issue where kernel hangs trying to find `ReprsOf` something that has `var`s in it
* Make `kernel` variable implicit so it can be threaded into functions

# 0.3.1 (Feb 19, 2020)
* Remove deprecated `polynote` shell script (use `python.py` instead)
* Disable notebook if writing fails repeatedly
* Unmangle package name for Spark 2.4.4 compatibility
* Validate config on server startup
* Respect language from imported Jupyter notebook
* Don't save stdout to the notebook if it's subsequently been erased
* Fix docker build for Scala 2.12/Spark 2.4
* Misc UI and backend fixes

# 0.3.0 (Feb 4, 2020)
* Better handling of unexpected kernel shutdowns 
* Presence 
* Add copy notebook 
* Use index for import 
* Use class indexer 
* Manually call atexit shutdown hooks 
* Fix Py4j version handling 
* Added browser notifications for completed cells of unfocused notebooks 
* Fix some websocket issues 
* Adds UI x to close error boxes 
* Retrieve causes of python exceptions 
* Get jars from `SPARK_DIST_CLASSPATH` with config 

# 0.2.17 (Jan 14, 2020)

* Create a websocket for every notebook
* Fixes for configuring pyspark executable locations

# 0.2.16 (Jan 9, 2020)

* Fixed some plotting and streaming data bugs 
* Better completions 
* Refactor the way notebook files are encoded/decoded and stored. Also fixes some issues in Zeppelin notebook import. 
* Address `serialize-javascript` vulnerability
* New hotkey, `Shift+F10`, to run all cells (thanks @kuckjwi0928) 
* Additional bugfixes and improvements

# 0.2.15 (Dec 28, 2019)

* Improved completions for Scala
* Fixed regression in python+spark interpreter where `kernel` (and thus matplotlib) isn't available.

# 0.2.14 (Dec 18, 2019)

* `<base>` tag can now be configured and works properly
* Renaming notebooks works properly
* Fixed plot editor buttons
* Improved docker build (thanks @mathematicalmichael and @JD557)
* Removed `pysparksession` (`spark` now works properly in pyspark)
* More improvements to python interpreter (stack traces, red squigglies, etc)
* Compiles against JDK11 (thanks @aborg0)
* Lazy vals don't cause errors (but still aren't really lazy)
* Identity provider framework and header-based authentication
* Timeout when searching for `ReprsOf`
* Fix resolution of some ivy/maven artifacts (thanks @JD557)
* Fix drag-and-drop events in Firefox (thanks @JD557)
* Support Safari (thanks @calmarj)
* Support ivy/maven credentials as coursier credentials.properties (thanks @JD557)
* Misc bugfixes improvements to remote kernel reliability

# 0.2.13 (Nov 7, 2019)

* Improve remote kernel error handling
* Make LimitedSharingClassLoader configurable (thanks @ghoto !)
* Remove `sun.misc.Cleaner` which is messes up JDK9+
* Resolve insecure py4j gateway issue (thanks again, @ghoto !)
* Fix bug in handling empty configs
* Add ability to specify multiple storage mounts

# 0.2.12 (Nov 5, 2019)

* Updated notebook list UI, with ability to rename and delete notebooks (right click), navigate with keyboard, etc
* Fixed classloading bug causing e.g. #588
* Don't override spark.app.name if it's set in the spark config
* Fix bug causing issues importing shared modules installed inside virtual environments
* Publish snapshot artifacts of all modules to sonatype

# 0.2.11 (October 31, 2019)
    
* Happy Halloween! This spoooooky release includes some minor bugfixes!
* Remove scala from the runtime assembly jars
* Set Python's sys.argv to prevent some libraries from complaining
* Configurable base URI, useful when behind a proxy

# 0.2.10 (October 30, 2019)

* Fix an NPE when trying to encode a null string
* Fix issue with package cells not working at all when Spark is enabled
* Self-host some external resources (font-awesome icons and katex)
* Fix critical issue in plot aggregations for collections-of-case-classes
* Attempt to fit initial plot size into available area in plot editor (fixes axes being cut off when window is too small)

# 0.2.9 (October 29, 2019)

* *New Python Runscript* which should hopefully help people who have been having trouble linking with Jep
* *Improved Security* by adding a unique websocket key generated on server start, reducing the chance of attacks on 
  the local websocket by malicious users 
* *Support for `package` definitions in Scala Cells*: users can now define package cells that are independent from other 
  notebook cells, useful for solving serialization issues and other problems. 
* Update Scala to `2.11.12` fixing the error people were having on JDK 9+
* Fix a bug with numeric aggregations (thanks @JD557 !)
* Fix a bug causing compatibility issues on newer JVMs (thanks @diesalbla)
* Fix a bug causing missing state when new interpreters are started in the middle of a notebook session
* Fix compatibility with Python 3.8
* No longer shadowing Scala SparkSession variable `spark` in Python cells. PySpark users should use the `pysparksession` 
  variable to access Pyspark's SparkSession. This is a temporary solution until we have a better one in place. 

# 0.2.8 (October 23, 2019)

* Fixes a dependency clash which was causing `NoSuchMethodError` and similar.

# 0.2.7 (October 23, 2019)

* Cross build for Scala 2.12
* Support for LaTeX MIME type output
* Fix some race conditions in Scala compiler
* Fix issue with nondeterministic queueing order
* Fix bug when notebook folder doesn't exist (Polynote now creates a notebook directory for you)
* Fix an issue where failed dependency downloads could cause notebook to be unresponsive until a restart


# 0.2.6 (October 18, 2019)

* Fix regression causing missing ExecutionInfo
* Fix regression causing the python interpreter shutdown to crash the kernel
* Fix regression causing symbol table to be stale after page reload
* Fix regression causing inserted cells not to be focused
* Remove spellcheck on code cells that would sometimes come up
* Always add a StringRepr. 
* Some minor cleanup of UI events
* Update fonts to address a bug in Firefox (https://bugzilla.mozilla.org/show_bug.cgi?id=1589156)
* Add some initial docs (more to come!)
* Update the logo (slightly)

# 0.2.5 (October 14, 2019)

* Subtasks!
  * Now related tasks are properly grouped together as parent and child tasks for less UI clutter
* Matplotlib backend
  * A proper Polynote backend for Matplotlib! Only supports regular old plotting, no interactive or animation support (for now)
* Finally added a license :) 
* Fix some bugs that were slowing down some Spark jobs. 
* Fix some bugs with Python-Scala interop
* Fix some more data encoding bugs

# 0.2.4 (October 10, 2019)

* Fix some bugs with data encoding
* Surface some error messages better in the UI
* Improve completions
* Add rudimentary auto-importing, kinda

# 0.2.3 (October 8, 2019)

* Better output display for some types
* Two new quick link buttons to go straight to the plot and data inspectors
* Fix race condition leading to the 'double typing issue'
* Fix some data encoding bugs
* Improvements and fixes to plot editor
* Better nullability handling across the board. 
* Fixes for some remote kernel sync issues
* Various bugfixes

# 0.2.2 (October 3, 2019)

* Fix bug setting spark output path
* Fix bug preventing download of dependencies
* Fix more completion bugs
* Fix more classloader bugs
* Fix more remote kernel bugs

# 0.2.1 (October 1, 2019)

* Fix cell queuing order bug
* add map types to schema view
* fix spark executors ui error
* fix remote kernel crash
* fix some bugs in Configuration UI
* fix case where some completions weren't working

# 0.2.0 (September 27, 2019)

* Significant rewrite of most backend code, switching over to ZIO! 
* Frontend ported to Typescript!

# 0.1.24 (September 9, 2019)

* Fix bug preventing jar dependencies with `+` in their name from working
* Fix broken restart of PySpark kernels. 
* minor UI fixes

# 0.1.23 (August 16, 2019)

* Support for being served under HTTPS

# 0.1.22 (August 14, 2019)

* Fix for `Shift+Enter` creating a newline rather than executing the cell
* Show tasks in Welcome screen
* Focus previous cell when last cell is deleted
* Remove formatting when converting text cells to code cells (e.g., if you copy/pasted some code and it has colors and such)
* New [About modal](https://user-images.githubusercontent.com/5430417/62907942-6dcdf100-bd2a-11e9-9065-acfcaf281c21.gif): 
    * Replaced barely used View Settings ugliness with fancy new modal with a bunch of info
    * `About` section has server version info
    * `Preferences` section has are for setting preferences and viewing/clearing storage (can be accessed directly by clicking the `gear` button.
        * The vim mode setting has been moved here
    * `Hotkeys` section has all available hotkeys (can be accessed directly by clicking the `?` button)
    * `Kernels` section shows all notebooks currently open by the server, with the ability to start/stop their kernel. 

# 0.1.21 (August 7, 2019)

* Fix hidden output off-by-one error
* Stability improvements for remote kernels
* Fix error causing failure to display inspector for certain types of Dataframes
* Fix error causing compilation failure when users define variable names that look like scala's generated synthetic members
  (e.g., a variable starting with `eq_`)
* Add version to app name
* minor refactoring to remove some `unsafeRun*`s. 

# 0.1.20 (August 1, 2019)

* Some minor UI improvements like
  * Collapse config when save button is pressed
  * Make it more obvious that output has been hidden
  * Fix some cases where the vim statusline disappeared
  * New Repr for Maps, show type in the data table, add Reprs for SparkSession and Runtime. 
  * Reload the UI upon reconnecting if it detects versions are out of whack. 
  * Fix cell anchor link regression
  * Make step execution favicon bubble green :) 
* Only create venv when python dependencies have been provided
* Overhaul python stack traces - get the actual error from py4j (e.g., pyspark) exceptions, clean up regular python stack traces. 
* Improve completions in the middle of a line by truncating it when sending to the presentation compiler
* Fix a bug preventing classes extending something imported in the same cell from working properly
* Display python docstrings and types (if possible) in Parameter hints
* Force spark session shutdown to run on the right thread

# 0.1.19 (July 23, 2019)

* Load the default.yml config even if config.yml itself is empty (normal case upon first installation)
* Add number of queued cells to favicon
* Disable running / editing cells upon disconnect. Attempt to reconnect when window is focused. 
* bust browser cache on release (hopefully you won't need to force-reload after upgrading any more!)
* Fix cyclic reference error
* Fix issue preventing vega interpreter from working properly if a string-typed variable was defined earlier
* Create a virtual environment every time. 
* Lazy vals no longer cause compile errors (they still have some problems though as detailed [here](https://github.com/polynote/polynote/issues/374))
* Fix compile error preventing definition of functions with default values. 

# 0.1.18 (July 17, 2019)

* Python Dependency support!
  * You can now specify Python dependencies (there's a little drop-down you can choose from in the Configuration panel). 
  * When you specify these dependencies, Polynote will create a notebook-specific virtual environment and install those dependencies inside it.
  * The virtual environment is configured to delegate to the system python environment so packages that already exist won't be installed again. It's persisted as well so it won't be recreated every time you restart polynote. 
* Support for base `default.yml` to be provided in distributions - no more clobbering people's configs!
* Fix for broken VIM mode 
* Improvements to data display:
  * Add chrome-inspector-style display of structures and arrays
  * Add Schema tab to inspector UI for table data
  * Some refactoring/removal of duplicate stuff
  * Add encoding of array fields to spark table data
* Create notebooks directory if it doesn't exist

# 0.1.17 (July 16, 2019)

* Move cell controls to top of cell, horizontally
  * Each cell has lang selector
  * Buttons to show/hide code and output
* Add new Vega spec interpreter for generating plots
* Add new inspection UI
  * Inspection comes up in a modal
  * Remove value column from symbol table
* Upgraded plot editor
  * Can save plot to a Vega spec cell
  * Better UI, can edit size and titles, functioning scatter plot
* Editor size adjusts after code folding

# 0.1.16 (July 3, 2019)

* Remove annoying jep uninstall message [#328]
* Overhaul Scala compilation for better serializability and stability. [#330]
  * Lift user-defined classes to package namespace (no more inner classes!) 
  * Only import necessary values from previous cells (rather than everything in that cell). Use proxy values rather 
    than imports to avoid closing over the entire cell. 
* Fix regression causing wide output to stretch cell too far [#333]
* Improvements to completions [#335]

[#328]: https://github.com/polynote/polynote/pull/328
[#330]: https://github.com/polynote/polynote/pull/330
[#333]: https://github.com/polynote/polynote/issues/333
[#335]: https://github.com/polynote/polynote/pull/335

# 0.1.15 (May 20, 2019)

* Install jep globally rather than locally [#324]

[#324]: https://github.com/polynote/polynote/pull/324

# 0.1.14 (May 20, 2019)

* Fix lingering positioning bugs (completions should work better now; no `OuterScopes` stuff)
* Fix spark serializer issue
* Minor style fixes

# 0.1.13 (May 16, 2019)

* Add support for simple references to `globals()` [#19]
* Fix Python scoping issue causing NameErrors for imports references inside inner scopes (e.g., in a function) [#315]
* Add `@transient` annotation to `polynote.runtime.Runtime.externalValues`, preventing Spark from serializing it. [#316]

[#19]: https://github.com/polynote/polynote/issues/19
[#315]: https://github.com/polynote/polynote/pull/315
[#316]: https://github.com/polynote/polynote/issues/316

# 0.1.12 (May 13, 2019)

* Fix Python output folding issue [#295]
* Duplicate notebook names now handled gracefully, we'll just increment the filename until there's no conflict [#296]
* Python `SyntaxError`s raised by parsing cell contents now raised as `CompileErrors` rather than Runtime Errors. [#301]
* Fix regression which broke implicits [#313]
* Improve performance of UI pane resizing, other minor UI improvements

[#295]: https://github.com/polynote/polynote/issues/295
[#296]: https://github.com/polynote/polynote/issues/296
[#301]: https://github.com/polynote/polynote/issues/301
[#313]: https://github.com/polynote/polynote/pull/313

# 0.1.11 (May 10, 2019)
* Fix positioning regression introduced in 0.1.10
* Only close over cells that are referenced in the current cell

# 0.1.10 (May 9, 2019)

* Can now bust cache of URL dependencies (e.g., `file:///`, `s3://`, etc) by adding URL parameter `?nocache` to the end of the path [#292]
* Support `s3n` and `s3a` URLs as well (just a config change on our end). 
* Fix bug in how we were assigning Python cell expressions to `Out` [#291]
* Fix Spark serialization issues [#300]

[#292]: https://github.com/polynote/polynote/issues/292
[#291]: https://github.com/polynote/polynote/issues/291
[#300]: https://github.com/polynote/polynote/pull/300

# 0.1.9 (May 3, 2019)

* Fix error when printing empty lines in python
* Fix data streaming on remote kernels
* Add table operations for sequences of case classes (supports plotting)
* Clear error squigglies when cell is run
* Save cell language into metadata field of ipynb
* Improved support for terminal output

# 0.1.8 (April 29, 2019)

* Fix some bugs that caused cell execution to hang
* Fix regression which caused repr display not to show up
* Fix some scala interpreter bugs, including one that prevented case classes (and other things) defined in a class from 
  being visible to other cells
* Better numpy support, fix for `Message class can only inherit from Message` error

# 0.1.7 (April 25, 2019)

* Fix an embarrassingly bad bug in [#241]

# 0.1.6 (April 25, 2019)

* Update coursier, giving an order-of-magnitude performance boost to dependency resolution (especially for deep dependency trees)
* Hotkey revamp [#241]
  * Share implementation across monaco and text cells
  * Added new hotkeys: Delete cell (ctrl-option-D), add cell above (ctrl-option-A), add cell below (ctrl-option-B)
  * Up and Down arrows now transition to neighboring cells if cursor is at start/end of cell text
* Display cell execution time while it is running [#253]
* Fix RuntimeError when using a numpy array. 

[#241]: https://github.com/polynote/polynote/issues/241
[#253]: https://github.com/polynote/polynote/issues/253

# 0.1.5 (April 19, 2019)

* Support for importing Zeppelin notebooks [#185]
  * Just drag and drop your `note.json` onto the tree view. 
  * Notebook creation and URL import are now two separate buttons. 
* Can now click between cells to create a new cell [#235]
* New clear output button - deletes all results/outputs of a notebook from UI and underlying file [#237]
* Fix scrolling behavior for selected cell [#240]

[#185]: https://github.com/polynote/polynote/issues/185
[#235]: https://github.com/polynote/polynote/issues/235
[#237]: https://github.com/polynote/polynote/issues/237
[#240]: https://github.com/polynote/polynote/issues/240

# 0.1.4 (April 16, 2019) 

* Style fixes and tweaks [#219], [#230]
* Fix delegation of failed classloadings [#246]

[#219]: https://github.com/polynote/polynote/pull/219
[#230]: https://github.com/polynote/polynote/pull/230
[#246]: https://github.com/polynote/polynote/pull/246

# 0.1.3 (April 12, 2019)

* Import and Export of Notebooks [#215]
  * New download button in Notebook toolbar downloads the ipynb representation of the notebook
  * Can import ipynb files by drag and drop onto the notebooks sidebar UI
  * Additionaly, can import notebooks directly from another Polynote instance when creating a notebook. 
    Just specify a URL instead of a name for the new notebook. 
    
* UI cleanup [#224]
  * drag borders always visible
  * some fixes for notebook panel view
* Vim mode no longer swallows Shift+Enter [#226]
* Fix bug preventing selection of leftmost tab when notebook panel was collapsed [#228]
* Fix bug causing output doubling [#227]
* Fix bug causing run script to fail when certain values were present in the config file [#232]
* Logging and Error visibility improvements [#218]
  * Kernel Error task message now includes stack trace
  * Log kernel errors to Polynote output instead of just UI. 
  * Run script by default tees logs to file to help debugging later

[#215]: https://github.com/polynote/polynote/issues/215
[#218]: https://github.com/polynote/polynote/issues/218
[#224]: https://github.com/polynote/polynote/pull/224
[#226]: https://github.com/polynote/polynote/pull/226
[#227]: https://github.com/polynote/polynote/issues/227
[#228]: https://github.com/polynote/polynote/issues/228
[#232]: https://github.com/polynote/polynote/pull/232

# 0.1.2 (April 5, 2019)

* Run scripts included in HTML Output [#205]
* Add UI support for warnings
* Warn (rather than error) if eta-expansion fails [#216]
* Collapsible sidebars [#11]
* Cells now show execution progress of top-level statements (scala cells only) [#221]
* Add VIM mode [#220]
* Additional bug fixes and UI tweaks ([#212], [#222])

[#11]:  https://github.com/polynote/polynote/issues/205
[#205]: https://github.com/polynote/polynote/issues/205
[#212]: https://github.com/polynote/polynote/issues/212
[#216]: https://github.com/polynote/polynote/pull/216
[#220]: https://github.com/polynote/polynote/issues/220
[#221]: https://github.com/polynote/polynote/pull/221
[#222]: https://github.com/polynote/polynote/pull/222




# 0.1.1 (April 2, 2019)

* Initial release of Polynote! :) 
