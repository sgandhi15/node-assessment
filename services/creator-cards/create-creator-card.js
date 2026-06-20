const validator = require('@app-core/validator');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const {
  CREATOR_CARD_ERROR_CODES,
  CreatorCardRepository,
  assertSlugIsAvailable,
  generateUniqueSlug,
  hasOwnValue,
  isDuplicateRecordError,
  serializeCreatorCard,
  throwBusinessError,
  validateAccessCodeFormat,
  validateLinks,
  validateServiceRates,
  validateSlugFormat,
} = require('./helpers');

const createCreatorCardSpec = `root {
  title string<trim|lengthBetween:3,100>
  description? string<trim|maxLength:500>
  slug? string<trim|lengthBetween:5,50>
  creator_reference string<trim|length:20>
  links[]? {
    title string<trim|lengthBetween:1,100>
    url string<trim|maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<trim|lengthBetween:3,100>
      description string<trim|maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<trim>
}`;

const parsedCreateCreatorCardSpec = validator.parse(createCreatorCardSpec);

function validateCreateBusinessRules(data) {
  const accessType = data.access_type || 'public';
  const hasAccessCode = hasOwnValue(data, 'access_code');

  if (data.slug) {
    validateSlugFormat(data.slug);
  }

  validateLinks(data.links);
  validateServiceRates(data.service_rates);

  if (accessType === 'private' && !hasAccessCode) {
    throwBusinessError(
      CreatorCardMessages.ACCESS_CODE_REQUIRED,
      CREATOR_CARD_ERROR_CODES.ACCESS_CODE_REQUIRED
    );
  }

  if (accessType !== 'private' && hasAccessCode) {
    throwBusinessError(
      CreatorCardMessages.ACCESS_CODE_PUBLIC_ONLY,
      CREATOR_CARD_ERROR_CODES.ACCESS_CODE_PUBLIC_ONLY
    );
  }

  if (accessType === 'private') {
    validateAccessCodeFormat(data.access_code);
  }
}

async function createCardRecord(cardData, isGeneratedSlug, attemptsRemaining = 5) {
  let createdCard;

  try {
    createdCard = await CreatorCardRepository.create(cardData);
  } catch (error) {
    if (!isDuplicateRecordError(error)) {
      throw error;
    }

    if (!isGeneratedSlug || attemptsRemaining <= 0) {
      throwBusinessError(CreatorCardMessages.SLUG_TAKEN, CREATOR_CARD_ERROR_CODES.SLUG_TAKEN);
    }

    createdCard = await createCardRecord(
      {
        ...cardData,
        slug: await generateUniqueSlug(cardData.title),
      },
      isGeneratedSlug,
      attemptsRemaining - 1
    );
  }

  if (!createdCard) {
    throwBusinessError(CreatorCardMessages.SLUG_TAKEN, CREATOR_CARD_ERROR_CODES.SLUG_TAKEN);
  }

  return createdCard;
}

async function createCreatorCard(serviceData) {
  let response;

  const data = validator.validate(serviceData, parsedCreateCreatorCardSpec);

  try {
    validateCreateBusinessRules(data);

    const isGeneratedSlug = !data.slug;
    const slug = data.slug || (await generateUniqueSlug(data.title));

    if (!isGeneratedSlug) {
      await assertSlugIsAvailable(slug);
    }

    const accessType = data.access_type || 'public';
    const cardData = {
      title: data.title,
      description: data.description || '',
      slug,
      creator_reference: data.creator_reference,
      links: data.links || [],
      service_rates: data.service_rates || null,
      status: data.status,
      access_type: accessType,
      access_code: accessType === 'private' ? data.access_code : null,
      deleted: null,
    };

    const createdCard = await createCardRecord(cardData, isGeneratedSlug);
    response = serializeCreatorCard(createdCard, { includeAccessCode: true });
  } catch (error) {
    appLogger.errorX(error, 'create-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = createCreatorCard;
