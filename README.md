# wget.js
Node.js wget-like alternative

# Command line

```
Usage: wget.js [options] <url>

Options:
  --np, --no-parent       don't ascend to the parent directory  [boolean] [default: false]
  -r, --recursive         specify recursive download  [boolean] [default: false]
  -P, --directory-prefix  save files to PREFIX/...  [string] [default: ""]
  --process               javascript module/function handling the contents
  -h, --help              Show help  [boolean]

Examples:
  wget.js http://www.yahoo.com  fetch the site content
```

# Module use

```javascript
var wget = require('wget.js');
wget("http://www.yahoo.com", {_: [], acceptHref: _ => _, process: _ => _});
```
