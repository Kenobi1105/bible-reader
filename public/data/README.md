# Local Bible Text Files

Place an approved local JSON file here when you are ready to bundle an offline translation.

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

The initial app deliberately does not bundle CUV text. Add the two CUV JSON files only after confirming the source, license, and required attribution for public redistribution.
