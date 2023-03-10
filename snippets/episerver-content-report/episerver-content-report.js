const FETCH_DELAY_TIMEOUT = 0 * 1000;
const CONTENT_FETCH_BATCH_SIZE = 50;

function range(x) {
  return [...Array(x).keys()];
}

async function delay(x) {
  return new Promise(function (resolve) {
    setTimeout(() => resolve(`delay:${x}`), x);
  });
}

async function withDelay(ms, fn) {
  const [result, delayId] = await Promise.all([fn(), delay(ms)]);
  return await Promise.all(result);
}

function groupBy(contentItems, keySelector) {
  return contentItems
    .reduce(
      (result, x) => keySelector(x) in result
        ? { ...result, ...{ [keySelector(x)]: result[keySelector(x)].concat(x) } }
        : { ...result, ...{ [keySelector(x)]: [x] } },
      {});
}

function toDictionary(contentItems, keySelector) {
  return contentItems
    .reduce(
      (result, x) => {
        const key = keySelector(x)
        if (key in result) {
          throw Error(`Key '${key} is in dictionary'`)
        }
        return { ...result, ...{ [key]: x } };
      },
      {});
}

function getRequestVerificationToken() {
  const el = document.getElementsByName('__RequestVerificationToken')[0]
  return el && el.value;
}

async function get(url, defaultValue) {
  return await fetch(url, { headers: { "requestverificationtoken": getRequestVerificationToken() } })
    .then(x => x.text())
    .then(x => x.startsWith('{}&&') ? x.substring(4) : x)
    .then(x => JSON.parse(x))
    .catch(error => {
      console.error('Failed to fetch / parse', url, error);
      return defaultValue;
    });
}

async function getContent(id) {
  return await id
    ? await get(`/EPiServer/cms/Stores/contentdata/${id}`, null)
    : Promise.resolve(null);
}

async function getContentByPermanentLink(id) {
  return await id
    ? await get(`/EPiServer/cms/Stores/contentstructure/?query=getcontentbypermanentlink&permanentLink=${encodeURIComponent(id)}&allLanguages=true`, null)
    : Promise.resolve(null);
}

async function getChildren(id) {
  return await id
    ? await get(`/EPiServer/cms/Stores/contentstructure/?referenceId=${id}&query=getchildren&typeIdentifiers=episerver.core.icontentdata&&allLanguages=true`, [])
    : Promise.resolve([]);
}


async function getReferencedContent(id) {
  return await id
    ? await get(`/EPiServer/cms/Stores/referenced-content/?ids=${id}`, [])
    : Promise.resolve([]);
}

async function getSharedAssetsFolderLink() {
  const root = await getContent(1);
  return await root.assetsFolderLink;
}

async function getDescendants(id, ignoreIds) {
  if (!id || ignoreIds.includes(id)) {
    return [];
  }

  const children = await getChildren(id);

  const assets = await withDelay(FETCH_DELAY_TIMEOUT, async () =>
    await Promise.all(
      children.map(async x => await getDescendants(x.assetsFolderLink, ignoreIds))
    )
  );

  const descendants = await withDelay(FETCH_DELAY_TIMEOUT, async () =>
    await Promise.all(
      children.map(async x => x.hasChildren
        ? await getDescendants(x.contentLink, ignoreIds)
        : []
      )
    )
  );

  return children.concat(...assets).concat(...descendants);
}

async function getDescendantsAndSelf(id) {
  const sharedAssetsFolderLink = await getSharedAssetsFolderLink();

  const content = await getContent(id);
  const assets = await getDescendants(content.assetsFolderLink, [sharedAssetsFolderLink]);
  const descendants = await getDescendants(id, [sharedAssetsFolderLink]);

  return [content].concat(...assets).concat(...descendants);
}

async function getContentBatch(ids) {
  return await withDelay(FETCH_DELAY_TIMEOUT, async () => await ids.map(async x => await getContent(x)));
}

async function getReferencedContentBatch(ids) {
  return await withDelay(FETCH_DELAY_TIMEOUT, async () => await ids.map(async x => await getReferencedContent(x)));
}

async function getInBatches(pageSize, ids, fn) {
  const total = ids.length;
  const totalPages = Math.floor(total / pageSize) + ((total % pageSize) > 0 ? 1 : 0);

  return range(totalPages)
    .reduce(async (result, page) =>
      (await result).concat(await fn(ids.slice(page * pageSize, page * pageSize + pageSize))),
      []
    );
}

async function getContentByIds(ids) {
  return await getInBatches(CONTENT_FETCH_BATCH_SIZE, ids, getContentBatch);
}

async function getReferencedContentByIds(ids) {
  const items = await getInBatches(CONTENT_FETCH_BATCH_SIZE, ids, getReferencedContentBatch);
  return items.flatMap(x => x);
}

function filterContent(x) {
  return true;
}

function getAbsoluteUrl(relativeUrl) {
  return location.origin + relativeUrl;
}

function getProperties(content) {
  return Object.entries(content.properties)
    .filter(([key, value]) => !key.includes("_") && !key.startsWith('page'))
    .reduce((result, [key, value]) => ({ ...result, ...{ [key]: value } }), {});
}

function getStatus(id) {
  const statuses = [
    'NotCreated',
    'Rejected',
    'CheckedOut',
    'CheckedIn',
    'Published',
    'PreviouslyPublished',
    'DelayedPublish',
    'AwaitingApproval',
  ];

  return statuses[id] ?? id;
}

function createMapGeneralContent(referenced) {
  return x => ({
    contentTypeName: x.contentTypeName,
    contentTypeID: x.contentTypeID,
    status: getStatus(x.status),
    name: x.name,
    // downloadUrl: getAbsoluteUrl(x.downloadUrl),
    editablePreviewUrl: getAbsoluteUrl(x.editablePreviewUrl),
    // previewUrl: getAbsoluteUrl(x.previewUrl),
    publicUrl: getAbsoluteUrl(x.publicUrl),
    languageId: x.currentLanguageBranch?.languageId,
    parentLink: x.parentLink,
    contentLink: x.contentLink,
    contentGuid: x.contentGuid,
    permanentLink: x.permanentLink,
    typeIdentifier: x.typeIdentifier,
    referenced: referenced[x.contentLink]?.references,
    uri: x.uri,
    created: x.created,
    createdBy: x.createdBy,
    changed: x.changed,
    changedBy: x.changedBy,
    published: x.published,
    publishedBy: x.publishedBy,
    deleted: x.deleted,
    deletedBy: x.deletedBy,
    ...getProperties(x),
  });
}

async function mapSpecificContent(x) {
  return {
    ...x,
  };
}

function getHtml(files) {
  return `
    <html>
      <head>
        <style>
tr:nth-child(odd) {
  background-color: #dddddd;
}
        </style
      </head>
      <body>
      ${getFilesTable(files)}
      </body>
    </html>`;
}

function getFilesTable(files) {
  return `
    <table cellspacing="0" cellpadding="2">
      ${getFilesTableRows(files)}
    </table>`;
}

function getFilesTableRows(files) {
  return files.map(({ name, numberOfItems, url }) => `
    <tr>
      <td style="width:300px"><strong>${name}</strong></td>
      <td style="width:100px">${numberOfItems} items</td>
      <td style="width:100px"><a href="${url}">Open</a></td>
      <td style="width:100px"><a download="${name}.json" href="${url}">Download</a></td>
    </tr>
  `).join('');
}

(async function () {
  const rootContentId = '1';
  // const rootContentId = '-1073741823__CatalogContent';
  console.log(`Root ID: ${rootContentId}`);

  const all = await getDescendantsAndSelf(rootContentId);
  console.log(`Found: ${all.length} content items`, all);

  const ids = all
    .filter(filterContent)
    .map(x => x.contentLink);
  console.log(`Ids: ${ids.length}`, ids);

  const referenced = await getReferencedContentByIds(ids);
  // console.log(`Referenced: ${referenced.length}`, referenced);

  const referencedDict = toDictionary(referenced, x => x.contentLink);
  // console.log(`referencedDict`, referencedDict);

  const contentItems = (await getContentByIds(ids)).filter(x => !!x);
  console.log(`Fetched: ${contentItems.length} content items`, contentItems);

  const grouped = groupBy(contentItems, x => x.contentTypeName);
  // console.log('grouped', grouped);

  const sorted = Object.entries(grouped);
  sorted.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  // console.log('sorted', sorted);

  // const permanentLinks = groupBy(contentItems, x => x.permanentLink);
  // console.log('permanentLinks', permanentLinks);

  const mapGeneralContent = await createMapGeneralContent(referencedDict);

  const files = await Promise.all(sorted.map(async ([name, items]) => {
    const generalContent = await Promise.all(items.map(mapGeneralContent));
    // console.log(name, 'generalContent', generalContent);

    const report = await Promise.all(generalContent.map(mapSpecificContent));
    // console.log(name, 'report', report);

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });

    return {
      name: name,
      numberOfItems: report.length,
      url: URL.createObjectURL(blob),
    };
  }));

  const reportBlob = new Blob([getHtml(files)], { type: "text/html" });
  window.open(URL.createObjectURL(reportBlob));
})();