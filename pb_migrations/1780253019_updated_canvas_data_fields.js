/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_75006869")

  // simplify rules - just require auth
  collection.createRule = "@request.auth.id != null"
  collection.listRule = "@request.auth.id != null"
  collection.viewRule = "@request.auth.id != null"
  collection.updateRule = "@request.auth.id != null"
  collection.deleteRule = "@request.auth.id != null"

  // replace project_id from relation to text
  const oldField = collection.fields.findById("relation376250268")
  if (oldField) {
    collection.fields.removeById("relation376250268")
  }

  const newField = new Field({
    autogeneratePattern: "",
    hidden: false,
    id: "text1234567890",
    max: 0,
    min: 0,
    name: "project_id",
    pattern: "",
    presentable: false,
    primaryKey: false,
    required: false,
    system: false,
    type: "text"
  })
  collection.fields.addAt(1, newField)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_75006869")

  collection.createRule = "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  collection.listRule = "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  collection.viewRule = "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  collection.updateRule = "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  collection.deleteRule = "project_id.user_id.id = @request.auth.id || @request.auth.collectionName = \"_superusers\""

  const oldField = collection.fields.findById("text1234567890")
  if (oldField) {
    collection.fields.removeById("text1234567890")
  }

  const newField = new Field({
    cascadeDelete: false,
    collectionId: "pbc_484305853",
    hidden: false,
    id: "relation376250268",
    maxSelect: 1,
    minSelect: 0,
    name: "project_id",
    presentable: false,
    required: false,
    system: false,
    type: "relation"
  })
  collection.fields.addAt(1, newField)

  return app.save(collection)
})
