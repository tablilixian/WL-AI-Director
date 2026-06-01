/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\"",
    "deleteRule": "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\"",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
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
        "cascadeDelete": false,
        "collectionId": "pbc_484305853",
        "hidden": false,
        "id": "relation376250268",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "project_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "json3867733328",
        "maxSize": 0,
        "name": "layers",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json2732419373",
        "maxSize": 0,
        "name": "canvas_offset",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "number3964020100",
        "max": null,
        "min": null,
        "name": "scale",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "number3206337475",
        "max": null,
        "min": null,
        "name": "version",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_75006869",
    "indexes": [],
    "listRule": "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\"",
    "name": "canvas_data",
    "system": false,
    "type": "base",
    "updateRule": "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\"",
    "viewRule": "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_75006869");

  return app.delete(collection);
})
