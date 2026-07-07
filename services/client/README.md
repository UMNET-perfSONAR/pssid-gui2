# Ideas for Future Improvement

### General
The interface has had a visual refresh, and its colors and product name are now
set per organization through the edition system (see ../../docs/deployment.md).
A formal UX review would still be worthwhile to refine the experience further.

### dynamicform.vue
Currently we are using the dynamic form component implemented by ourselves.
The major benefit is that it allows flexible input validation, allowing
arbitrary user-defined validation code passed in as strings. Adopting a commodity
dynamic form component, e.g. JSONForms, is an approach that we could consider in the
future, although we need to evaluate the margin of benefit considering that the
current custom version is only about 100 lines of code to maintain.

### src/views/. 
.vue files have a certain level of duplication. This is because the functionalities of
some pages are essentially identical - a list of existing items, editing/deleting
items, adding new items, etc. Removing this duplication completely is difficult
because each page more or less has some unique features that do not quite fit into
a uniform template. Some potential solutions are listed as follows (from previous
development effort).

* .vue files can be simplified significantly! If we take advantage of the src/components/dynamicform.vue and src/components/edit_dynamicform.vue files and retrofit these files accordingly, this will become MUCH cleaner.
  * Can actually create a MongoDB collection with a "page" for each .vue file! Pull formstuff/layout stuff from there and index by name! (Store a name and formlayout attribute in the database to make this work).

* Move to composition API layout! Currently using vue's options layout and it isn't the cleanest approach. Attempted to start this with the src/views/hosts.api.vue file! (Not perfectly functional but a good start :p)

* Move some of the data formatting/ computation stuff (tests especially) to the corresponding /src/stores/ file. Will help trim files significantly. Ran out of time for this!
