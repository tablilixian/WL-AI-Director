/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text98176952",
        "max": 100,
        "min": 0,
        "name": "template_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "help": "",
        "hidden": false,
        "id": "file3112513328",
        "maxSelect": 1,
        "maxSize": 5242880,
        "mimeTypes": [
          "image/png",
          "image/jpeg",
          "image/webp"
        ],
        "name": "preview",
        "presentable": false,
        "protected": false,
        "required": true,
        "system": false,
        "thumbs": null,
        "type": "file"
      }
    ],
    "id": "pbc_4294202090",
    "indexes": [],
    "listRule": null,
    "name": "template_previews",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4294202090");

  return app.delete(collection);
})
