# General Backend Notes

See /src for more information on specific files

Note that the src and build directories are nearly identical. This is because corresponding Javascript files are created upon compilation of a Typescript file. These Javascript files "use strict", meaning that they maintain the same typed behavior as the Typescript files - they are just more compatible/easier for the computer to execute.

To improve readability, the .ts files are located in the src directory for development, while the .js files are located in the build directory for execution. Everytime we rebuild the docker containers, or update a file and save it, the new .js files will be built and run automatically.
