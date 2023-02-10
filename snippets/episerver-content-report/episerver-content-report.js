function range(x) {
    return [...Array(x).keys()];
}

async function delay(x) {
    return new Promise(function(resolve) {
        setTimeout(() => resolve(`delay:${x}`), x);
    });
}

async function withDelay(ms, fn) {
    const [result, delayId] = await Promise.all([fn(), delay(ms)]);
    return await Promise.all(result);
}

function getRequestVerificationToken() {
    const el = document.getElementsByName('__RequestVerificationToken')[0]
    return el && el.value;
}

// epi 12 only
async function getContentTypes() {
    return fetch(`/EPiServer/EPiServer.Cms.UI.Admin/ContentTypes/list`, { headers: { "requestverificationtoken": getRequestVerificationToken() }})
        .then(x => x.text())
        .then(x => x.startsWith('{}&&') ? x.substring(4) : x)
        .then(x => JSON.parse(x));
}

async function getContent(id) {
    return await id
        ? fetch(`/EPiServer/cms/Stores/contentdata/${id}`, { headers: { "requestverificationtoken": getRequestVerificationToken() }})
            .then(x => x.text())
            .then(x => x.startsWith('{}&&') ? x.substring(4) : x)
            .then(x => JSON.parse(x))
        : Promise.resolve(null);
}

async function getContentByPermanentLink(id) {
    return await id
        ? fetch(`https://eastcapital.local/EPiServer/cms/Stores/contentstructure/?query=getcontentbypermanentlink&permanentLink=${encodeURIComponent(id)}&allLanguages=true`, { headers: { "requestverificationtoken": getRequestVerificationToken() }})
            .then(x => x.text())
            .then(x => x.startsWith('{}&&') ? x.substring(4) : x)
            .then(x => JSON.parse(x))
        : Promise.resolve(null);
}

async function getChildren(id) {
    return await fetch(`/EPiServer/cms/Stores/contentstructure/?referenceId=${id}&query=getchildren&typeIdentifiers=episerver.core.icontentdata&&allLanguages=true`, { headers: { "requestverificationtoken": getRequestVerificationToken() }})
        .then(x => x.text())
        .then(x => x.startsWith('{}&&') ? x.substring(4) : x)
        .then(x => JSON.parse(x));
}

async function getDescendants(id) {
    const children = await getChildren(id);
    const descendants = await Promise.all(
        children.map(async x => x.hasChildren
            ? await withDelay(5000, async () => await getDescendants(x.contentLink))
            : []
        )
    );

    return children.concat(...descendants);
}

async function getDescendantsAndSelf(id) {
    const content = await getContent(id);
    const descendants = await getDescendants(id);
    return [content].concat(...descendants);
}

async function getContentBatch(ids) {
    return await withDelay(5000, async () => await ids.map(async x => await getContent(x)));
}

async function getContentInBatches(ids, pageSize) {
    const total = ids.length;
    const totalPages = Math.floor(total / pageSize) + ((total % pageSize) > 0 ? 1 : 0);

    return range(totalPages)
        .reduce(async (result, page) => 
            (await result).concat(await getContentBatch(ids.slice(page * pageSize, page * pageSize + pageSize)))
        , []);
}

async function getContentByIds(ids) {
    return await getContentInBatches(ids, 50);
}

function groupedByType(contentItems, getGroupKey) {
    return contentItems
        .reduce(
            (result, x) => getGroupKey(x) in result
                ? { ...result, ...{ [getGroupKey(x)]: result[getGroupKey(x)].concat(x) }}
                : { ...result, ...{ [getGroupKey(x)]: [x] }},
            {});
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
        .reduce((result, [key, value]) => ({ ...result, ...{ [key]: value }}), {});
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

async function mapGeneralContent(x) {
    return {
        contentTypeName: x.contentTypeName,
        contentTypeID: x.contentTypeID,
        status: getStatus(x.status),
        name: x.name,
        // downloadUrl: getAbsoluteUrl(x.downloadUrl),
        editablePreviewUrl: getAbsoluteUrl(x.editablePreviewUrl),
        // previewUrl: getAbsoluteUrl(x.previewUrl),
        publicUrl: getAbsoluteUrl(x.publicUrl),
        languageId: x.currentLanguageBranch?.languageId,
        contentLink: x.contentLink,
        contentGuid: x.contentGuid,
        permanentLink: x.permanentLink,
        typeIdentifier: x.typeIdentifier,
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
    };
}

async function mapSpecificContent(x) {
    return {
        ...x,
    };
}

async function getImageUrl(id) {
    return !!id
        ? await getAbsoluteUrl((await getContent(id)).publicUrl)
        : null;
}

function getHtml(files) {    
    return files.map(({name, numberOfItems, url}) => `
<div>
    <span style="width:300px"><strong>${name}</strong></span>
    <span style="width:100px">${numberOfItems} items</span>
    <span><a download="${name}.json" href="${url}">Download</a></span>
</div>
    `);
}

(async function() {
    const rootContentId = 1;

    const all = await getDescendantsAndSelf(rootContentId);
    // console.log('all', all);

    const ids = all
        .filter(filterContent)
        .map(x => x.contentLink);
    // console.log('ids', ids);

    const contentItems = await getContentByIds(ids);
    // console.log('contentItems', contentItems);

    const grouped = groupedByType(contentItems, x => x.contentTypeName)
    // console.log('grouped', grouped);
    
    // const dict = groupedByType(contentItems, x => x.permanentLink);    
    // console.log('permanentLinks', permanentLinks);

    const files = await Promise.all(Object.entries(grouped).map(async ([name, items]) => {
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

    const reportBlob = new Blob(getHtml(files), { type: "text/html" });
    window.open(URL.createObjectURL(reportBlob));
})();