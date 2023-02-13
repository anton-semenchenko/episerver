## Fetch content from episerver cms

- Login to episerver cms
- Open chrome -> developer tools -> sources tab -> add snippet
- Import snippet
- Update `rootContentId` - starting content id in the hierarchy
- Update `filterContent` function to filter content
- Update `mapSpecificContent` function to map additional properties, fetch referenced content, etc
- Run the snippet
- Json files will be available in opened window (maybe blocked by browser)


If the script fails with `net::ERR_INSUFFICIENT_RESOURCES` or other network errors:
  - try increase `FETCH_DELAY_TIMEOUT` (timeout between fetching content batches)
  - try decrease `CONTENT_FETCH_BATCH_SIZE`


Fetch referenced content example:
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
