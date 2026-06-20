process.env.USE_MOCK_MODEL = '1';

const { expect } = require('chai');
const { createServer } = require('@app-core/server');
const simulateRequest = require('@app-core/mock-server/simulate-request');
const { MockModelStubs } = require('@app/mock-models');
const CreatorCardRepository = require('@app/repository/creator-card');
const createCreatorCard = require('@app/services/creator-cards/create-creator-card');
const getCreatorCard = require('@app/services/creator-cards/get-creator-card');
const deleteCreatorCard = require('@app/services/creator-cards/delete-creator-card');
const createEndpoint = require('../endpoints/creator-cards/create');
const getEndpoint = require('../endpoints/creator-cards/get');
const deleteEndpoint = require('../endpoints/creator-cards/delete');

const CREATOR_REFERENCE = 'crt_8f2k1m9x4p7w3q5z';

function buildCard(overrides = {}) {
  return MockModelStubs.CreatorCard.createDocument({
    _id: '01JG8XYZA2B3C4D5E6F7G8H9J0',
    title: 'George Cooks',
    description: 'Weekly cooking podcast',
    slug: 'george-cooks',
    creator_reference: CREATOR_REFERENCE,
    links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
    service_rates: {
      currency: 'NGN',
      rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
    },
    status: 'published',
    access_type: 'public',
    access_code: null,
    created: 1767052800000,
    updated: 1767052800000,
    deleted: null,
    ...overrides,
  });
}

async function expectAppError(promise, code) {
  let caughtError;

  try {
    await promise;
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).to.not.equal(undefined);
  expect(caughtError.errorCode).to.equal(code);
}

describe('creator cards', () => {
  const activeStubs = [];
  const rawRestorers = [];

  function registerStub(stub) {
    activeStubs.push(stub);
    return stub;
  }

  function mockFindOneWith(card) {
    return registerStub(
      MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: () => card,
      })
    );
  }

  function mockFindOneNull() {
    return registerStub(
      MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        mockNull: true,
      })
    );
  }

  function mockRawMethod(method, implementation) {
    const rawModel = CreatorCardRepository.raw();
    const original = rawModel[method];

    rawModel[method] = implementation;
    rawRestorers.push(() => {
      if (original) {
        rawModel[method] = original;
      } else {
        delete rawModel[method];
      }
    });
  }

  afterEach(() => {
    while (activeStubs.length) {
      activeStubs.pop().revert();
    }

    while (rawRestorers.length) {
      rawRestorers.pop()();
    }
  });

  it('creates a full public card with id serialization and no _id leak', async () => {
    mockFindOneNull();

    const card = await createCreatorCard({
      title: 'George Cooks',
      description: 'Weekly cooking podcast',
      slug: 'george-cooks',
      creator_reference: CREATOR_REFERENCE,
      links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
      service_rates: {
        currency: 'NGN',
        rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
      },
      status: 'published',
    });

    expect(card).to.include({
      title: 'George Cooks',
      slug: 'george-cooks',
      access_type: 'public',
      access_code: null,
      deleted: null,
    });
    expect(card.id).to.not.equal(undefined);
    expect(card).not.to.have.property('_id');
    expect(card.links).to.deep.equal([
      { title: 'YouTube', url: 'https://youtube.com/@georgecooks' },
    ]);
  });

  it('auto-generates a slug from the title', async () => {
    mockFindOneNull();

    const card = await createCreatorCard({
      title: 'Ada Designs Things',
      creator_reference: 'crt_a1b2c3d4e5f6g7h8',
      status: 'published',
    });

    expect(card.slug).to.equal('ada-designs-things');
  });

  it('returns access_code on private card creation', async () => {
    mockFindOneNull();

    const card = await createCreatorCard({
      title: 'VIP Rate Card',
      creator_reference: 'crt_x9y8z7w6v5u4t3s2',
      status: 'published',
      access_type: 'private',
      access_code: 'A1B2C3',
    });

    expect(card.access_type).to.equal('private');
    expect(card.access_code).to.equal('A1B2C3');
  });

  it('returns custom business errors for create rules', async () => {
    mockFindOneWith(buildCard());

    await expectAppError(
      createCreatorCard({
        title: 'Another George',
        slug: 'george-cooks',
        creator_reference: 'crt_m1n2b3v4c5x6z7l8',
        status: 'published',
      }),
      'SL02'
    );

    activeStubs.pop().revert();
    await expectAppError(
      createCreatorCard({
        title: 'Secret Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        access_type: 'private',
      }),
      'AC01'
    );

    await expectAppError(
      createCreatorCard({
        title: 'Public Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        access_type: 'public',
        access_code: 'A1B2C3',
      }),
      'AC05'
    );

    await expectAppError(
      createCreatorCard({
        title: 'Bad Status Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'archived',
      }),
      'SPCL_VALIDATION'
    );
  });

  it('rejects links that only provide a protocol without a valid host', async () => {
    await expectAppError(
      createCreatorCard({
        title: 'Bad Link Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        links: [{ title: 'Bad', url: 'https://' }],
        status: 'published',
      }),
      'SPCL_VALIDATION'
    );
  });

  it('retrieves public cards without access_code', async () => {
    mockFindOneWith(buildCard());

    const card = await getCreatorCard({ slug: 'george-cooks' });

    expect(card.slug).to.equal('george-cooks');
    expect(card).not.to.have.property('access_code');
    expect(card).not.to.have.property('_id');
  });

  it('uses the path slug for public retrieval even when a query slug is supplied', async () => {
    const server = createServer();
    const stub = registerStub(
      MockModelStubs.CreatorCard.configureStubs({
        method: 'findOne',
        overrideFn: (queryData) => buildCard({ slug: queryData.query.slug }),
      })
    );

    server.addHandler(getEndpoint);

    const response = await simulateRequest(server, {
      method: 'GET',
      path: '/creator-cards/george-cooks?slug=vip-card',
    });

    expect(response.statusCode).to.equal(200);
    expect(response.data.data.slug).to.equal('george-cooks');
    expect(stub.mockedDoc.queryData.query).to.include({
      slug: 'george-cooks',
      deleted: null,
    });
  });

  it('applies public retrieval access rules in order', async () => {
    mockFindOneNull();
    await expectAppError(getCreatorCard({ slug: 'does-not-exist-123' }), 'NF01');

    activeStubs.pop().revert();
    mockFindOneWith(buildCard({ status: 'draft' }));
    await expectAppError(getCreatorCard({ slug: 'my-draft-card' }), 'NF02');

    activeStubs.pop().revert();
    mockFindOneWith(buildCard({ access_type: 'private', access_code: 'A1B2C3' }));
    await expectAppError(getCreatorCard({ slug: 'vip-rate-card' }), 'AC03');
    await expectAppError(getCreatorCard({ slug: 'vip-rate-card', access_code: 'WRONG1' }), 'AC04');
  });

  it('retrieves private cards with the correct access_code and omits the pin', async () => {
    mockFindOneWith(buildCard({ access_type: 'private', access_code: 'A1B2C3' }));

    const card = await getCreatorCard({ slug: 'vip-rate-card', access_code: 'A1B2C3' });

    expect(card.access_type).to.equal('private');
    expect(card).not.to.have.property('access_code');
  });

  it('soft deletes an active card and returns the deleted card in creation format', async () => {
    mockRawMethod('findOneAndUpdate', async (query, updateValues) => {
      expect(query).to.deep.equal({
        slug: 'ada-designs-things',
        creator_reference: 'crt_a1b2c3d4e5f6g7h8',
        deleted: null,
      });

      return buildCard({
        slug: query.slug,
        creator_reference: query.creator_reference,
        deleted: updateValues.$set.deleted,
        updated: updateValues.$set.updated,
      });
    });

    const card = await deleteCreatorCard({
      slug: 'ada-designs-things',
      creator_reference: 'crt_a1b2c3d4e5f6g7h8',
    });

    expect(card.slug).to.equal('ada-designs-things');
    expect(card.deleted).to.be.a('number');
    expect(card).to.have.property('access_code');
  });

  it('uses the path slug for deletion even when a body slug is supplied', async () => {
    const server = createServer();
    let observedQuery;

    server.addHandler(deleteEndpoint);
    mockRawMethod('findOneAndUpdate', async (query, updateValues) => {
      observedQuery = query;

      return buildCard({
        slug: query.slug,
        creator_reference: query.creator_reference,
        deleted: updateValues.$set.deleted,
        updated: updateValues.$set.updated,
      });
    });

    const response = await simulateRequest(server, {
      method: 'DELETE',
      path: '/creator-cards/george-cooks',
      requestConfig: {
        body: {
          slug: 'vip-card',
          creator_reference: CREATOR_REFERENCE,
        },
      },
    });

    expect(response.statusCode).to.equal(200);
    expect(response.data.data.slug).to.equal('george-cooks');
    expect(observedQuery).to.deep.equal({
      slug: 'george-cooks',
      creator_reference: CREATOR_REFERENCE,
      deleted: null,
    });
  });

  it('returns NF01 when deleting a missing card', async () => {
    mockRawMethod('findOneAndUpdate', async () => null);

    await expectAppError(
      deleteCreatorCard({
        slug: 'does-not-exist-123',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
      }),
      'NF01'
    );
  });

  it('formats HTTP errors with the required status and top-level code', async () => {
    const server = createServer();

    server.addHandler(getEndpoint);
    mockFindOneNull();

    const response = await simulateRequest(server, {
      method: 'GET',
      path: '/creator-cards/does-not-exist-123',
    });

    expect(response.statusCode).to.equal(404);
    expect(response.data).to.include({
      status: 'error',
      message: 'Creator card not found',
      code: 'NF01',
    });
  });

  it('returns HTTP 400 for VSL validation errors', async () => {
    const server = createServer();

    server.addHandler(createEndpoint);

    const response = await simulateRequest(server, {
      method: 'POST',
      path: '/creator-cards',
      requestConfig: {
        body: {
          title: 'Bad Status Card',
          creator_reference: 'crt_q1w2e3r4t5y6u7i8',
          status: 'archived',
        },
      },
    });

    expect(response.statusCode).to.equal(400);
    expect(response.data.status).to.equal('error');
  });
});
