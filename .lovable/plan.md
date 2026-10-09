# Upload the Metal Back wall product photo using the existing form

## Confirmed: no code changes needed

`ItemUpdateForm` already accepts images and videos, uploads them to public media storage, and includes the uploaded files when you click **Post update**. The media bucket exists, is public, and has authenticated upload rules.

The supplied item ID belongs to **Metal Back wall**, on **PO EM/PO/26-27/198**, linked to **order EM/SO/26-27/188**. Its current stage is **metal_fabrication**.

## Steps for the admin

1. Sign in as an admin and open **PO Tracker Updates** from the sidebar, or visit `/admin/po-tracker-update`.
2. Search for **EM/SO/26-27/188**. Open the card for **EM/PO/26-27/198**.
3. Find the **Metal Back wall** item form within the expanded card.
4. Keep or select the accurate production stage and status. For a photo of ongoing fabrication, select **Metal Fabrication** and **In progress**; do not mark it completed unless that is accurate.
5. Click **Add** in the media area and choose the product photo from your device. Wait until its preview appears.
6. Optionally add a note, then click **Post update**. Wait for **Production update posted**. Uploading alone does not create the production update record.
7. Expand **Show History** under the item to check the posted photo. Use **Send Email** on the PO card when you want to send a production notification; posting an ordinary production update does not automatically send a client email.

## Future email thumbnails

The manual production email and both dispatch email flows already call `latestItemThumbnail()` for the relevant PO and item. Your posted photo is eligible to appear automatically when those emails are generated; previously sent emails will not change.

**Existing limitation:** the helper examines only the newest update whose `media_urls` is not null. A later update with an empty media array or videos only can prevent an older photo from appearing. To ensure the photo appears, attach it to the latest update before sending the email.

## Scope and verification

No new utility, code change, storage change, production record, or email send is proposed. The flow is confirmed from the existing code and current item/storage records; an actual upload has not been performed because the photo is not available here.
