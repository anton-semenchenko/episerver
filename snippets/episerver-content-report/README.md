- login to episerver cms
- open chrome -> developer tools -> sources tab -> add snippet
- import snippet
- update `rootContentId` - starting content id in the hierarchy
- update `filterContent` function to filter content
- update `mapSpecificContent` function to map additional properties, fetch referenced content, etc
- run the snippet
- json files will be available in opened window (maybe blocked by browser)


# Fetch referenced content example (`getAbsoluteUrl` is in the script)
```
async function mapSpecificContent(x) {
    return {
        ...x,
        ...(x.contentTypeName == 'Article' ? { imageUrl: await getImageUrl(x.image) } : {}),
    };
}

async function getImageUrl(id) {
    return !!id
        ? await getAbsoluteUrl((await getContent(id)).publicUrl)
        : null;
}
```
