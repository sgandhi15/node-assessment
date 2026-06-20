const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { randomBytes } = require('@app-core/randomness');
const { CreatorCardMessages } = require('@app/messages');
const CreatorCardRepository = require('@app/repository/creator-card');
const { URL } = require('url');

const CREATOR_CARD_ERROR_CODES = {
  SLUG_TAKEN: 'SL02',
  ACCESS_CODE_REQUIRED: 'AC01',
  ACCESS_CODE_PUBLIC_ONLY: 'AC05',
  NOT_FOUND: 'NF01',
  DRAFT_NOT_FOUND: 'NF02',
  PRIVATE_ACCESS_CODE_REQUIRED: 'AC03',
  INVALID_ACCESS_CODE: 'AC04',
};

const ACCESS_CODE_REGEX = /^[a-zA-Z0-9]{6}$/;
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;
const LINK_URL_REGEX = /^https?:\/\//;
const MAX_SLUG_LENGTH = 50;
const SUFFIX_LENGTH = 6;
const SUFFIX_SEPARATOR_LENGTH = 1;

function hasOwnValue(data, field) {
  return Object.prototype.hasOwnProperty.call(data, field);
}

function throwBusinessError(message, code) {
  throwAppError(message, code);
}

function throwValidationError(message) {
  throwAppError(message, 'SPCL_VALIDATION');
}

function isDuplicateRecordError(error) {
  return error?.errorCode === ERROR_CODE.DUPLRCRD || error?.errorCode === 'DUPLICATE_RECORD';
}

function unwrapDocument(document) {
  let unwrappedDocument;

  if (document?.toObject) {
    unwrappedDocument = document.toObject();
  } else {
    unwrappedDocument = document?._doc || document;
  }

  return unwrappedDocument;
}

function serializeLinks(links = []) {
  const linkList = Array.isArray(links) ? links : [];

  return linkList.map((link) => {
    const unwrappedLink = unwrapDocument(link);

    return {
      title: unwrappedLink.title,
      url: unwrappedLink.url,
    };
  });
}

function serializeServiceRates(serviceRates) {
  let serializedServiceRates = null;

  if (serviceRates) {
    const unwrappedServiceRates = unwrapDocument(serviceRates);
    const rates = Array.isArray(unwrappedServiceRates.rates) ? unwrappedServiceRates.rates : [];

    serializedServiceRates = {
      currency: unwrappedServiceRates.currency,
      rates: rates.map((rate) => {
        const unwrappedRate = unwrapDocument(rate);

        return {
          name: unwrappedRate.name,
          description: unwrappedRate.description,
          amount: unwrappedRate.amount,
        };
      }),
    };
  }

  return serializedServiceRates;
}

function serializeCreatorCard(card, options = {}) {
  const { includeAccessCode = false } = options;
  const unwrappedCard = unwrapDocument(card);

  const serializedCard = {
    id: unwrappedCard._id,
    title: unwrappedCard.title,
    description: unwrappedCard.description || '',
    slug: unwrappedCard.slug,
    creator_reference: unwrappedCard.creator_reference,
    links: serializeLinks(unwrappedCard.links || []),
    service_rates: serializeServiceRates(unwrappedCard.service_rates),
    status: unwrappedCard.status,
    access_type: unwrappedCard.access_type || 'public',
    created: unwrappedCard.created,
    updated: unwrappedCard.updated,
    deleted: typeof unwrappedCard.deleted === 'number' ? unwrappedCard.deleted : null,
  };

  if (includeAccessCode) {
    serializedCard.access_code = unwrappedCard.access_code || null;
  }

  return serializedCard;
}

function createSlugFromTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

function truncateSlug(slug, maxLength) {
  return slug.slice(0, maxLength);
}

function appendRandomSuffix(slug) {
  const maxBaseLength = MAX_SLUG_LENGTH - SUFFIX_SEPARATOR_LENGTH - SUFFIX_LENGTH;
  const base = truncateSlug(slug, maxBaseLength);

  return `${base}-${randomBytes(SUFFIX_LENGTH)}`;
}

async function findCardBySlug(slug) {
  return CreatorCardRepository.findOne({ query: { slug } });
}

async function findActiveCardBySlug(slug) {
  return CreatorCardRepository.findOne({ query: { slug, deleted: null } });
}

async function slugExists(slug) {
  const existingCard = await findCardBySlug(slug);

  return !!existingCard;
}

async function assertSlugIsAvailable(slug) {
  const exists = await slugExists(slug);

  if (exists) {
    throwBusinessError(CreatorCardMessages.SLUG_TAKEN, CREATOR_CARD_ERROR_CODES.SLUG_TAKEN);
  }
}

async function generateUniqueSlugWithSuffix(title) {
  const candidate = appendRandomSuffix(createSlugFromTitle(title));
  const shouldAppendSuffix = await slugExists(candidate);

  if (shouldAppendSuffix) {
    return generateUniqueSlugWithSuffix(title);
  }

  return candidate;
}

async function generateUniqueSlug(title) {
  const candidate = truncateSlug(createSlugFromTitle(title), MAX_SLUG_LENGTH);
  const shouldAppendSuffix = candidate.length < 5 || (await slugExists(candidate));

  if (shouldAppendSuffix) {
    return generateUniqueSlugWithSuffix(title);
  }

  return candidate;
}

function validateSlugFormat(slug) {
  if (!SLUG_REGEX.test(slug)) {
    throwValidationError(CreatorCardMessages.INVALID_SLUG);
  }
}

function isValidLinkUrl(url) {
  if (!LINK_URL_REGEX.test(url)) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);

    return (
      !!parsedUrl.hostname && (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:')
    );
  } catch (error) {
    return false;
  }
}

function validateLinks(links = []) {
  links.forEach((link) => {
    if (!isValidLinkUrl(link.url)) {
      throwValidationError(CreatorCardMessages.INVALID_LINK_URL);
    }
  });
}

function validateServiceRates(serviceRates) {
  if (serviceRates) {
    serviceRates.rates.forEach((rate) => {
      if (!Number.isInteger(rate.amount)) {
        throwValidationError(CreatorCardMessages.INVALID_RATE_AMOUNT);
      }
    });
  }
}

function validateAccessCodeFormat(accessCode) {
  if (!ACCESS_CODE_REGEX.test(accessCode)) {
    throwValidationError(CreatorCardMessages.INVALID_ACCESS_CODE_FORMAT);
  }
}

module.exports = {
  CREATOR_CARD_ERROR_CODES,
  CreatorCardRepository,
  assertSlugIsAvailable,
  findActiveCardBySlug,
  generateUniqueSlug,
  hasOwnValue,
  isDuplicateRecordError,
  serializeCreatorCard,
  throwBusinessError,
  validateAccessCodeFormat,
  validateLinks,
  validateServiceRates,
  validateSlugFormat,
};
