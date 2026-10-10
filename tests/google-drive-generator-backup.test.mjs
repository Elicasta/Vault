import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
 DRIVE_BACKUP_FOLDER,DRIVE_FILE_SCOPE,DRIVE_MAX_BACKUP_BYTES,vaultBackupCandidates,
 driveBackupFileName,driveBackupMetadata,googleDriveEscapedQuery,
} from "../lib/drive-backup.mjs";

test("private Supabase media are eligible for backup, signed URLs and external links are not",()=>{
  const items=[
    {type:"image",key:"a",canonical_url:"vault-media://vault-media/user/1/img.png",storage_path:"user/1/img.png",url:"https://signed.example/expires=5"},
    {type:"video",key:"b",canonical_url:"vault-media://vault-media/user/1/movie.mp4",storage_path:"user/1/movie.mp4"},
    {type:"image",key:"c",url:"https://foo.example/photo.jpg"},
    {type:"video",key:"d",canonical_url:"vault-media://vault-media/user/1/movie.mp4",storage_path:"user/1/movie.mp4"},
    {type:"link",key:"e",canonical_url:"vault-media://vault-media/user/1/book.pdf",storage_path:"user/1/book.pdf"}
  ];
  const result=vaultBackupCandidates(items);
  assert.equal(result.length,2);
  assert.deepEqual(result.map(x=>x.key),["a","b"]);
});

test("uploaded Drive files preserve extensions and sanitize unsafe titles",()=>{
  assert.equal(driveBackupFileName({title:"image one",storage_path:"one/55/a.webp",type:"image"}),"image one.webp");
  assert.equal(driveBackupFileName({title:"My custom image.jpg",storage_path:"x/y.png",type:"image"}),"My custom image.jpg");
  assert.equal(driveBackupFileName({title:"A/B: C",storage_path:"u/1/clip.mp4",type:"video"}),"A-B- C.mp4");
  const doc=driveBackupMetadata({title:"My image",folder:"Venice",storage_path:"x/y.png",type:"image"},"folder-123","sha256test","image/png");
  assert.equal(doc.parents[0],"folder-123");
  assert.equal(doc.appProperties.vaultBackupHash,"sha256test");
  assert.match(doc.description,/Venice/);
});

test("Drive OAuth is least privilege and folder query values escape safely",()=>{
  assert.equal(DRIVE_FILE_SCOPE,"https://www.googleapis.com/auth/drive.file");
  assert.equal(DRIVE_BACKUP_FOLDER,"Vault Backups");
  assert.equal(DRIVE_MAX_BACKUP_BYTES,52428800);
  assert.equal(googleDriveEscapedQuery("X'\\OR"),"X\\'\\\\OR");
});

test("Google backup flow downloads private authenticated storage bytes and never stores OAuth access tokens",()=>{
  const client=fs.readFileSync("lib/google-drive-backup-client.js","utf8");
  const component=fs.readFileSync("components/GoogleDriveBackup.jsx","utf8");
  assert.match(client,/accounts\.google\.com\/gsi\/client/);
  assert.match(client,/initTokenClient/);
  assert.match(client,/drive\.googleapis\.com|www\.googleapis\.com/);
  assert.match(client,/uploadType=multipart|DRIVE_UPLOAD_ENDPOINT/);
  assert.match(component,/VAULT_MEDIA_BUCKET/);
  assert.match(component,/\.download\(item\.storage_path\)/);
  assert.match(component,/listVaultDriveBackupHashes/);
  assert.match(component,/hashVaultStoragePath/);
  assert.match(component,/window\.google\?\.accounts\?\.oauth2\?\.revoke/);
  assert.doesNotMatch(component,/localStorage\.setItem|sessionStorage\.setItem/);
});

test("Venice and Perchance workspaces preserve actual private files",()=>{
  const source=fs.readFileSync("components/GeneratorWorkspace.jsx","utf8");
  const vault=fs.readFileSync("components/vault-v2/VaultV2.jsx","utf8");
  assert.match(source,/uploadVaultMedia\(userId, file\)/);
  assert.match(source,/deleteVaultMedia\(userId, upload\.locator\)/);
  assert.match(source,/clipboardData/);
  assert.match(source,/venice\.ai/);
  assert.match(source,/perchance\.org/);
  assert.match(vault,/GoogleDriveBackup/);
  assert.match(vault,/GeneratorWorkspace/);
});

test("Chrome companion smart screenshot crops media, not whole page, requiring user click",()=>{
  const source=fs.readFileSync("extensions/vault-media-capture/smart-screenshot.js","utf8");
  const html=fs.readFileSync("extensions/vault-media-capture/popup.html","utf8");
  const background=fs.readFileSync("extensions/vault-media-capture/background.js","utf8");
  assert.match(source,/chrome\.tabs\.captureVisibleTab/);
  assert.match(source,/getContext\("2d"\)\.drawImage\(screenshot,x,y,w,h,0,0,w,h\)/);
  assert.match(source,/chrome\.downloads\.download/);
  assert.match(source,/armExactMediaPicker/);
  assert.match(html,/Capture main image/);
  assert.match(background,/VAULT_SMART_PICK/);
});
