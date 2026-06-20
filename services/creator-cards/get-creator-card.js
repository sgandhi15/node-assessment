const validator = require('@app-core/validator');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const {
  CREATOR_CARD_ERROR_CODES,
  findActiveCardBySlug,
  hasOwnValue,
  serializeCreatorCard,
  throwBusinessError,
} = require('./helpers');

const getCreatorCardSpec = `root {
  slug string<trim>
  access_code? string<trim>
}`;

const parsedGetCreatorCardSpec = validator.parse(getCreatorCardSpec);

async function getCreatorCard(serviceData) {
  let response;

  const data = validator.validate(serviceData, parsedGetCreatorCardSpec);

  try {
    const card = await findActiveCardBySlug(data.slug);

    if (!card) {
      throwBusinessError(CreatorCardMessages.NOT_FOUND, CREATOR_CARD_ERROR_CODES.NOT_FOUND);
    }

    if (card.status === 'draft') {
      throwBusinessError(CreatorCardMessages.NOT_FOUND, CREATOR_CARD_ERROR_CODES.DRAFT_NOT_FOUND);
    }

    if (card.access_type === 'private' && !hasOwnValue(data, 'access_code')) {
      throwBusinessError(
        CreatorCardMessages.PRIVATE_ACCESS_CODE_REQUIRED,
        CREATOR_CARD_ERROR_CODES.PRIVATE_ACCESS_CODE_REQUIRED
      );
    }

    if (card.access_type === 'private' && data.access_code !== card.access_code) {
      throwBusinessError(
        CreatorCardMessages.INVALID_ACCESS_CODE,
        CREATOR_CARD_ERROR_CODES.INVALID_ACCESS_CODE
      );
    }

    response = serializeCreatorCard(card);
  } catch (error) {
    appLogger.errorX(error, 'get-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = getCreatorCard;
