/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.createRule = ""
  collection.listRule = "id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  collection.viewRule = "id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  collection.updateRule = "id = @request.auth.id || @request.auth.collectionName = \"_superusers\""
  collection.deleteRule = "id = @request.auth.id || @request.auth.collectionName = \"_superusers\""

  // allow any user to auth (not just superusers)
  collection.authRule = ""

  // enable password auth via email
  collection.passwordAuth = { enabled: true, identityFields: ["email"] }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.createRule = null
  collection.listRule = "id = @request.auth.id"
  collection.viewRule = "id = @request.auth.id"
  collection.updateRule = "id = @request.auth.id"
  collection.deleteRule = "id = @request.auth.id"

  collection.authRule = null
  collection.passwordAuth = { enabled: false, identityFields: [] }

  return app.save(collection)
})
