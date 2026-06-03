migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_727377051")
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "file4729183646",
    "maxSelect": 20,
    "maxSize": 10485760,
    "mimeTypes": ["image/jpeg","image/png","image/webp","image/gif"],
    "name": "images",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_727377051")
  collection.fields.removeById("file4729183646")
  app.save(collection)
})
