# Third-party notices

`create-axmorf-studio` itself has no runtime npm dependencies. The workspace it
generates declares `@axmorf/studio`, Remotion, React, and other production
dependencies as ordinary exact npm dependencies.

Those packages are downloaded by the user's npm client and are not bundled in
this initializer. They retain their own licenses. In particular, Remotion's npm
metadata identifies its license as `SEE LICENSE IN LICENSE.md`; review the
license files distributed with the installed `remotion` and `@remotion/*`
packages and the [Remotion website](https://www.remotion.dev/) before use.

The generated workspace's `package.json` is the authoritative list of direct
package names and versions. Installed package metadata and license files are the
authoritative notices for transitive dependencies.
