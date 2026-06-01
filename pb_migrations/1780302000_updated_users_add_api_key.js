/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // add api_key field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3373460894",
    "max": 1000,
    "min": 0,
    "name": "api_key",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // Allow users to update their own record
  collection.updateRule = "@request.auth.id != null && @request.auth.id = id"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // remove the field on rollback
  collection.fields.removeById("text3373460894")

  return app.save(collection)
})
