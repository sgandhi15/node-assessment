const validator = require('@app-core/validator');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const {
  CREATOR_CARD_ERROR_CODES,
  CreatorCardRepository,
  serializeCreatorCard,
  throwBusinessError,
} = require('./helpers');

const deleteCreatorCardSpec = `root {
  slug string<trim>
  creator_reference string<trim|length:20>
}`;

const parsedDeleteCreatorCardSpec = validator.parse(deleteCreatorCardSpec);

async function deleteCreatorCard(serviceData) {
  let response;

  const data = validator.validate(serviceData, parsedDeleteCreatorCardSpec);

  try {
    const deletedAt = Date.now();
    const deletedCard = await CreatorCardRepository.raw().findOneAndUpdate(
      {
        slug: data.slug,
        creator_reference: data.creator_reference,
        deleted: null,
      },
      {
        $set: {
          deleted: deletedAt,
          updated: deletedAt,
        },
      },
      {
        new: true,
        lean: true,
      }
    );

    if (!deletedCard) {
      throwBusinessError(CreatorCardMessages.NOT_FOUND, CREATOR_CARD_ERROR_CODES.NOT_FOUND);
    }

    response = serializeCreatorCard(deletedCard, { includeAccessCode: true });
  } catch (error) {
    appLogger.errorX(error, 'delete-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = deleteCreatorCard;
