# Deploy the frontend on CloudFront

This guide takes the app from a local Vite dev server to `https://bmconline.in`. You buy the domain at GoDaddy. DNS, the site, and the certificate stay in AWS. The API stays in Docker on the existing EC2 instance. CloudFront serves the built frontend and forwards `/api/*` to that instance. The certificate is a free public certificate from AWS Certificate Manager. Browsers trust it. Do not buy GoDaddy’s SSL product.

The React app already requests relative paths such as `/api/v1/auth/login`. The production build does not point at `localhost`. No frontend code change is required for the API address.

## What you end up with

| Piece | Where it lives |
| --- | --- |
| `https://bmconline.in` | CloudFront, HTTPS |
| HTML, JS, and CSS | Private S3 bucket |
| `/api/*` | Docker on the existing EC2 instance |
| Domain registration | GoDaddy |
| DNS | Route 53 hosted zone. GoDaddy’s nameservers are replaced with Route 53 |
| Certificate | ACM in **US East (N. Virginia)**, `us-east-1` |

After the security-group step, the API is no longer open to the internet on the EC2 IP. Browsers reach it only as `https://bmconline.in/api/...`.

## Cost

| Item | Price |
| --- | --- |
| `bmconline.in` at GoDaddy | Often ₹1 for the first year. Renewal is the price shown in the cart, commonly about ₹600–₹900 per year |
| Route 53 hosted zone | $0.50 per month. This is required because GoDaddy holds the registration and Route 53 holds the DNS records |
| ACM certificate on CloudFront | $0 |
| S3 storage for this app | Well under $0.01 per month |
| CloudFront traffic | $0 while you stay inside the always-free 1 TB and 10 million HTTPS requests per month |

Skip AWS WAF when the console offers it. WAF is a separate paid service. In the GoDaddy cart, decline hosting, email, website builder, and any paid SSL certificate. ACM is the certificate.

Read the renewal price on the GoDaddy checkout page before you pay. A premium name costs more than the ₹1 offer. GST can be added on both the GoDaddy bill and the AWS bill.

`bmconline.gov.in` is already a Bhopal Municipal Corporation site. `bmconline.in` is a different name. Continue only if GoDaddy shows it available and it is the name you want.

## Before you start

You need:

- A GoDaddy account, used only to buy and hold `bmconline.in`.
- The AWS account that owns the EC2 instance, signed in through the console.
- Permission to use Route 53, S3, CloudFront, Certificate Manager, and EC2 security groups.
- The EC2 instance running, with Docker publishing the API on a fixed host port. This repo’s dev proxy uses port **8000**. On the instance, run `docker ps` and note the host port in the `PORTS` column, for example `0.0.0.0:8000->8000/tcp`. Use that host port everywhere below. These steps say **8000**.
- An Elastic IP attached to the instance. A normal public IP changes when the instance stops, and CloudFront would then send `/api` to the wrong address. In the EC2 console: **Elastic IPs** → **Allocate Elastic IP address** → **Allocate** → select it → **Actions** → **Associate Elastic IP address** → choose the instance. Copy the Elastic IP. These steps call it `EC2_IP`.
- Node.js and npm on the machine where this repo is checked out.

Do the sections in order. The certificate cannot be issued until GoDaddy is using the Route 53 nameservers, and CloudFront cannot use the domain name until the certificate is **Issued**.

## 1. Buy bmconline.in at GoDaddy

GoDaddy is only the registrar. The website records are created in Route 53 in the next section. Leave GoDaddy’s default DNS in place until that hosted zone exists, then switch nameservers once.

1. Sign in at [GoDaddy](https://www.godaddy.com/en-in) and search for `bmconline.in`.
2. Add the domain to the cart for 1 year. Keep the first-year offer only if you accept the renewal price printed under it.
3. On the cart and the extras pages, remove Professional Email, Microsoft 365, Web Hosting, Website Builder, and SSL. The padlock comes from ACM later.
4. Enter a real registrant name, email, phone, and postal address. `.in` registration goes through India’s registry (NIXI).
5. Pay, and wait until the domain shows as active under **My Products** → **Domains**. That is often a few minutes.

Do not add A records, forwarding, or a GoDaddy website yet. Those settings are ignored after the nameserver switch, and they are the wrong place to point this app.

## 2. Create the Route 53 zone and point GoDaddy at it

Buying the name at GoDaddy does not create anything in AWS. Create the zone, then make GoDaddy delegate the domain to it.

1. Open the [Route 53 console](https://console.aws.amazon.com/route53/).
2. Choose **Hosted zones** → **Create hosted zone**.
3. Domain name: `bmconline.in`.
4. Type: **Public hosted zone**.
5. Choose **Create hosted zone**.
6. Open the new zone. Copy the four values of the **NS** record. They look like `ns-123.awsdns-45.com`. You need all four.

In GoDaddy:

1. **My Products** → **Domains** → `bmconline.in` → **DNS** → **Nameservers** → **Change**.
2. Choose **Enter my own nameservers** (GoDaddy sometimes labels this **I’ll use my own nameservers**).
3. Replace the GoDaddy nameservers with the four Route 53 NS values. Delete any extra GoDaddy nameserver rows.
4. Save.

Nameserver changes usually show up within an hour and can take up to 48 hours. Check from your computer:

```bash
dig NS bmconline.in +short
```

Continue when the answer is the four `awsdns` names, not `domaincontrol.com`. Certificate validation and the site both wait on this. The GoDaddy DNS page can still show old records after the switch. Those records are no longer used. Add the site records only in the Route 53 zone.

## 3. Request the certificate

CloudFront only accepts certificates created in **US East (N. Virginia)**.

1. In the console top bar, set the Region to **US East (N. Virginia) us-east-1**.
2. Open [AWS Certificate Manager](https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1).
3. Choose **Request a certificate**.
4. Choose **Request a public certificate**, then **Next**.
5. Fully qualified domain names:
   - `bmconline.in`
   - `www.bmconline.in`
6. Validation method: **DNS validation**.
7. Key algorithm: **RSA 2048**.
8. Choose **Request**.

The certificate stays **Pending validation** until the DNS records exist in Route 53 and GoDaddy’s nameservers are the four Route 53 names from section 2. If **Create records in Route 53** does not list `bmconline.in`, the public hosted zone is missing or its name does not match exactly.

1. Open the new certificate.
2. In **Domains**, choose **Create records in Route 53**.
3. Confirm both names and choose **Create records**.

Refresh the certificate until the status is **Issued**. This often takes a few minutes and can take up to 30 minutes. Copy the certificate ID or leave this tab open. You need this certificate in the CloudFront step.

Leave the Region on N. Virginia only while you are in Certificate Manager. S3 and EC2 stay in the Region where the instance already runs. CloudFront is global and has no Region switch.

## 4. Build the frontend

On your computer, in this repo:

```bash
npm ci
npm run build
```

`npm run build` typechecks the project and writes the site into `dist/`. You upload the **contents** of `dist/` (the `index.html` file and the `assets` folder at the top of the bucket), not the `dist` folder itself.

The local `npm run dev` proxy to `http://localhost:8000` is only for development. It is not part of `dist/`.

## 5. Create a private S3 bucket

1. Set the console Region to the Region of the EC2 instance (for example **Asia Pacific (Mumbai) ap-south-1**).
2. Open [S3](https://s3.console.aws.amazon.com/s3/home).
3. Choose **Create bucket**.
4. Bucket name: `bmconline-frontend`. The name must be unique across all of AWS. If it is taken, use `bmconline-frontend-` plus a short suffix.
5. Leave **Block all public access** on. CloudFront will read the bucket through an origin access control. The bucket must not be a public website.
6. Leave versioning off and encryption on the default SSE-S3.
7. Choose **Create bucket**.

Upload the site:

1. Open the bucket.
2. Choose **Upload**.
3. Choose **Add files** and **Add folder**. Select everything inside `dist/`: `index.html`, `assets`, and any other files the build produced.
4. Choose **Upload**.
5. Confirm `index.html` is at the bucket root, next to `assets/`, not inside a `dist/` prefix.

## 6. Create the CloudFront distribution

1. Open the [CloudFront console](https://console.aws.amazon.com/cloudfront/).
2. If the page asks you to pick a pricing plan, choose **Pay as you go**. Do not choose the Pro, Business, or Premium flat-rate plans.
3. Choose **Create distribution**.

### S3 origin

1. Origin domain: select the `bmconline-frontend` bucket. Use the REST endpoint that looks like `bmconline-frontend.s3.ap-south-1.amazonaws.com`, not the website endpoint that contains `s3-website`.
2. Origin access: **Origin access control settings (recommended)**.
3. Choose **Create new OAC**. Accept the defaults and create it. The name can be `bmconline-frontend-oac`.
4. The page shows a bucket policy. Choose **Copy policy**. You will paste it into S3 in the next section. If the button is **Save changes** later instead, the console can apply the policy for you. Either way the bucket policy must allow this distribution’s OAC.

### Default behavior (the frontend)

1. Viewer protocol policy: **Redirect HTTP to HTTPS**.
2. Allowed HTTP methods: **GET, HEAD**.
3. Cache policy: **CachingOptimized**.
4. Do not turn on AWS WAF if the goal is the low cost above.

### Distribution settings

1. Price class: **Use all edge locations**. That includes the India edges.
2. Alternate domain name (CNAME): add `bmconline.in` and `www.bmconline.in`.
3. Custom SSL certificate: select the **Issued** certificate for `bmconline.in`. If it is missing, the certificate is still pending or it was requested outside `us-east-1`.
4. Default root object: `index.html`.
5. Choose **Create distribution**.

Copy the distribution domain name. It looks like `d111111abcdef8.cloudfront.net`. These steps call it `DISTRIBUTION_DOMAIN`. Copy the distribution ID too. It looks like `E1A2B3C4D5E6F7`.

Deployment status stays **Deploying** for several minutes. You can keep going while it deploys.

## 7. Allow CloudFront to read the bucket

Skip this section if the CloudFront console already saved the bucket policy.

1. Open the S3 bucket → **Permissions** → **Bucket policy** → **Edit**.
2. Paste the policy CloudFront gave you. It looks like this, with your bucket name, account ID, and distribution ID:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::bmconline-frontend/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

3. Save. **Block all public access** stays on.

## 8. Send /api to the EC2 container

The distribution still has only the S3 origin. Add the API origin and a behavior for `/api/*`.

1. CloudFront → your distribution → **Origins** → **Create origin**.
2. Origin domain: `EC2_IP`. CloudFront may warn that this is an IP. That is expected. If the console refuses a bare IP, use the instance’s public DNS name (`ec2-x-x-x-x.ap-south-1.compute.amazonaws.com`) from the EC2 instance details page. That name follows the Elastic IP.
3. Protocol: **HTTP only**.
4. HTTP port: **8000**.
5. Name the origin `ec2-api` if the form asks for a name.
6. Create the origin.

This hop is HTTP. Viewers still use HTTPS as far as CloudFront. The security group in section 11 is what stops the open internet from using `http://EC2_IP:8000` directly. Encrypting this hop as well would mean installing a certificate on the instance. That costs more operational work and is not required for the browser lock.

1. Open **Behaviors** → **Create behavior**.
2. Path pattern: `/api/*`.
3. Origin: the EC2 origin you just created.
4. Viewer protocol policy: **Redirect HTTP to HTTPS**.
5. Allowed HTTP methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**.
6. Cache policy: **CachingDisabled**.
7. Origin request policy: **AllViewerExceptHostHeader**. This forwards `Authorization` and the JSON body. The app sends `Authorization: Bearer ...` on API calls.
8. Create the behavior.

`/api/*` is more specific than the default `*` behavior, so API calls go to EC2 and page routes go to S3.

## 9. Serve client-side routes

Refreshing `https://bmconline.in/tanks/new` asks S3 for an object named `tanks/new`. That object does not exist. A CloudFront Function, attached only to the default behavior, rewrites those routes to `index.html`. The `/api/*` behavior does not use the function, so API 401 and 404 responses stay JSON.

1. CloudFront → **Functions** → **Create function**.
2. Name: `bmconline-spa-rewrite`.
3. Paste this code:

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.endsWith("/")) {
    request.uri += "index.html";
  } else if (!uri.includes(".")) {
    request.uri = "/index.html";
  }

  return request;
}
```

4. Choose **Save changes**, then **Publish**. Publishing is required. A saved draft is not used by the distribution.
5. Open the **Publish** tab → **Add association**.
6. Distribution: your distribution.
7. Event type: **Viewer request**.
8. Cache behavior: **Default (*)**. Do not select `/api/*`.
9. Add the association and wait until the distribution is **Deployed** again.

## 10. Point the domain at CloudFront

1. Route 53 → **Hosted zones** → `bmconline.in`.
2. Choose **Create record**.
3. Record name: leave blank so the record is `bmconline.in`.
4. Record type: **A**.
5. Turn on **Alias**.
6. Route traffic to: **Alias to CloudFront distribution**.
7. Choose the distribution. If it is not listed, paste `DISTRIBUTION_DOMAIN`.
8. Create the record.
9. Create a second record the same way with type **AAAA**. CloudFront has IPv6 addresses, and some networks use them.
10. Create another **A** alias and another **AAAA** alias with record name `www`, both aimed at the same distribution.

The ACM validation records are already in this zone. Leave them there so the certificate can renew.

DNS can take a few minutes to update. Route 53 alias records for CloudFront are not charged per query.

## 11. Close the API port to the public internet

Do this only after `https://bmconline.in` loads and a login request reaches the API. Test first (section 12). If you lock the security group before CloudFront works, you will have no way to reach the API while you fix the distribution.

1. EC2 → **Security groups** → the group attached to the API instance.
2. **Inbound rules** → **Edit inbound rules**.
3. Remove the rule that allows port **8000** from `0.0.0.0/0` or `::/0`.
4. Add a rule:
   - Type: **Custom TCP**
   - Port: **8000**
   - Source: **Prefix list**
   - Prefix list: `com.amazonaws.global.cloudfront.origin-facing`
5. Leave SSH (port 22) limited to your own IP. Do not open port 22 to the world while closing port 8000.
6. Save.

CloudFront’s edges are the only clients that can open port 8000. `http://EC2_IP:8000` from a home network or a phone should time out or be refused.

## 12. Check the site

Wait until the distribution status is **Deployed**.

1. Open `https://bmconline.in`. You should see the login page, with a padlock.
2. Open `http://bmconline.in`. It should redirect to `https://bmconline.in`.
3. Open `https://www.bmconline.in`. It should show the same app.
4. Sign in with a real user. The browser request URL should be `https://bmconline.in/api/v1/auth/login`, not the EC2 IP.
5. Open a tank, then refresh the browser on that tank’s URL. You should get the app, not an S3 XML error.
6. After section 11, open `http://EC2_IP:8000/api/v1/auth/login` from your own machine. It should fail to connect.

If the page loads but login fails with a network error, the `/api/*` behavior, the origin port, or the security group does not match the Docker host port.

If refresh on `/tanks/new` shows an XML `AccessDenied` or `NoSuchKey`, the function is not published or it is not associated with the **Default (*)** viewer-request behavior.

If the certificate warning appears, the alternate domain names on the distribution do not match the ACM certificate, or the certificate is not in `us-east-1`.

## 13. Later releases

On your computer:

```bash
npm run build
```

In the S3 console, upload the new contents of `dist/` into the same bucket and replace existing files. Delete old files under `assets/` that are no longer in `dist/assets/`, or the bucket will fill with previous bundles. Those old files are not served after `index.html` points at the new names, but they still count as storage.

Then invalidate the cached page:

1. CloudFront → your distribution → **Invalidations** → **Create invalidation**.
2. Object paths: `/index.html` and `/`.
3. Create.

Hashed files in `assets/` can stay cached. The first 1,000 invalidation paths each month are free. One invalidation with two paths counts as two paths.

The API container is unchanged by a frontend release. You only touch EC2 when you change the backend.

## Order if you need to redo one piece

1. Domain active at GoDaddy, and `dig NS bmconline.in +short` returns the four Route 53 nameservers.
2. Certificate **Issued** in `us-east-1`.
3. Bucket private, `index.html` at the root.
4. Distribution **Deployed**, with both alternate domain names and that certificate.
5. OAC bucket policy saved.
6. `/api/*` behavior pointing at port 8000 with caching disabled.
7. SPA function published on the default behavior only.
8. Route 53 A and AAAA aliases for the apex and for `www`.
9. Site tested over HTTPS.
10. Port 8000 limited to the CloudFront prefix list.
