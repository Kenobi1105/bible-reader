# Local Bible Text Files

Place only an approved local JSON file here when you are ready to bundle an offline translation. See the release record in [../../THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) before adding data.

The reader accepts either of these lightweight shapes:

~~~json
{
  "John": {
    "1": {
      "1": "In the beginning...",
      "2": "He was with God..."
    }
  }
}
~~~

~~~json
{
  "books": [
    {
      "name": "John",
      "chapters": {
        "1": {
          "verses": [
            { "number": 1, "text": "In the beginning..." }
          ]
        }
      }
    }
  ]
}
~~~

Do not add NET or LXX text files here. This app intentionally keeps those editions online only under its current source policy.

For every permitted local file, add a short adjacent metadata file that names the edition, upstream source, version date, licence/terms URL, and the exact required attribution. The initial app deliberately does not bundle CUV text; add either CUV JSON file only after retaining that metadata and confirming the chosen source is still suitable for public redistribution.
