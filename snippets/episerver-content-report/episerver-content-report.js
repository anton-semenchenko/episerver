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

async function getContent(id) {
    return await id
        ? fetch(`/EPiServer/cms/Stores/contentdata/${id}`)
            .then(x => x.text())
            .then(x => x.substring(4))
            .then(x => JSON.parse(x))
        : Promise.resolve(null);
}

async function getChildren(id) {
    return await fetch(`/EPiServer/cms/Stores/contentstructure/?referenceId=${id}&query=getchildren&typeIdentifiers=episerver.core.pagedata`)
        .then(x => x.text())
        .then(x => x.substring(4))
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

function filterContent(x) {
    return x.contentTypeName == 'EmployeePage';
}
async function mapContent(x) {
    return {
        contentGuid: x.contentGuid,
        givenName: x.properties.givenName,
        surName: x.properties.sn,
        employeePublicUrl: `${location.origin}${x.publicUrl}`,
        hasImage: !!x.properties.imageLink,
        imageLink: x.properties.imageLink,
        imagePublicUrl: !!x.properties.imageLink
            ? `${location.origin}${(await getContent(x.properties.imageLink)).publicUrl}`
            : null,
        mail: x.properties.mail,
        jobTitle: x.properties.jobTitle,
        company: x.properties.company,
        department: x.properties.department,
        telephoneNumber: x.properties.telephoneNumber,
        mobile: x.properties.mobile,
    };
}

(async function() {
    const all = await getDescendants(1);
    console.log('all', all);

    const ids = all
        .filter(filterContent)
        .map(x => x.contentLink);
    console.log('ids', ids);    

    const contentItems = await getContentByIds(ids);
    console.log('contentItems', contentItems);

    const report = await Promise.all(contentItems.map(mapContent));
    console.log('report', report);
})();