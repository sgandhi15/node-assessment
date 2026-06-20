const { ModelSchema, SchemaTypes, DatabaseModel } = require('@app-core/mongoose');

const modelName = 'creator_cards';

const linkSchema = {
  _id: false,
  title: { type: SchemaTypes.String, required: true },
  url: { type: SchemaTypes.String, required: true },
};

const rateSchema = {
  _id: false,
  name: { type: SchemaTypes.String, required: true },
  description: { type: SchemaTypes.String, required: true },
  amount: { type: SchemaTypes.Number, required: true },
};

const serviceRatesSchema = {
  currency: { type: SchemaTypes.String, required: true },
  rates: { type: [rateSchema], required: true },
};

/**
 * @typedef {Object} CreatorCard
 * @property {String} _id
 * @property {String} title
 * @property {String} description
 * @property {String} slug
 * @property {String} creator_reference
 * @property {Object[]} links
 * @property {Object|null} service_rates
 * @property {String} status
 * @property {String} access_type
 * @property {String|null} access_code
 * @property {Number} created
 * @property {Number} updated
 * @property {Number|null} deleted
 */
const schemaConfig = {
  _id: { type: SchemaTypes.ULID, required: true },
  title: { type: SchemaTypes.String, required: true },
  description: { type: SchemaTypes.String, default: '' },
  slug: { type: SchemaTypes.String, required: true, unique: true, index: true },
  creator_reference: { type: SchemaTypes.String, required: true, index: true },
  links: { type: [linkSchema], default: [] },
  service_rates: { type: serviceRatesSchema, default: null },
  status: { type: SchemaTypes.String, required: true, index: true },
  access_type: { type: SchemaTypes.String, required: true, default: 'public' },
  access_code: { type: SchemaTypes.String, default: null },
  created: { type: SchemaTypes.Number, required: true },
  updated: { type: SchemaTypes.Number, required: true },
  deleted: { type: SchemaTypes.Number, default: null, index: true },
};

const modelSchema = new ModelSchema(schemaConfig, { collection: modelName });

module.exports = DatabaseModel.model(modelName, modelSchema);
