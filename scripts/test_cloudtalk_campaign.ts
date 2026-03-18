import "dotenv/config";

import { getCloudTalkConfigForProfile, parseName } from "@/lib/cloudtalk/contact";

type CloudTalkEnvelope<T> = {
  responseData: T & {
    status: number;
    message?: string;
  };
};

type AddContactResponse = CloudTalkEnvelope<{
  data?: {
    id?: string | number;
  };
}>;

type ShowContactResponse = CloudTalkEnvelope<{
  Contact?: {
    id?: string | number;
    name?: string;
  };
  ContactNumber?: Array<{
    public_number?: string | number;
  }>;
  ContactsTag?: Array<{
    id?: string | number;
    name?: string;
  }>;
}>;

type CampaignIndexResponse = CloudTalkEnvelope<{
  itemsCount?: number;
  data?: Array<{
    Campaign?: {
      id?: string | number;
      name?: string;
      status?: string;
    };
    ContactsTag?: Array<{
      id?: string | number;
      name?: string;
    }>;
    Agent?: Array<{
      id?: string | number;
      fullname?: string;
    }>;
  }>;
}>;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function formatPhone(phoneNumber: string): string {
  let formattedPhone = phoneNumber.trim();
  if (!formattedPhone.startsWith("+")) {
    formattedPhone = formattedPhone.replace(/\D/g, "");
    if (formattedPhone.length === 10) {
      formattedPhone = `+1${formattedPhone}`;
    } else if (formattedPhone.length === 11 && formattedPhone.startsWith("1")) {
      formattedPhone = `+${formattedPhone}`;
    } else {
      formattedPhone = `+${formattedPhone}`;
    }
  }
  return formattedPhone;
}

function createAuthHeader(): string {
  const accountId = requireEnv("NEXT_PUBLIC_CLOUDTALK_ACCOUNT_ID");
  const apiSecret = requireEnv("NEXT_PUBLIC_CLOUDTALK_API_SECRET");
  return `Basic ${Buffer.from(`${accountId}:${apiSecret}`).toString("base64")}`;
}

async function callCloudTalk<T>(path: string, init?: RequestInit): Promise<{ response: Response; data: T }> {
  const response = await fetch(`https://my.cloudtalk.io/api${path}`, init);
  const data = (await response.json()) as T;
  return { response, data };
}

async function main() {
  const retentionId = process.argv[2]?.trim() ?? "";
  const phoneNumber = process.argv[3]?.trim() ?? "";
  const fullNameArg = process.argv[4]?.trim() || "CloudTalk Test Contact";

  if (!retentionId || !phoneNumber) {
    console.error("Usage: npm run cloudtalk:test-campaign -- <retention_id> <phone_number> [full_name]");
    process.exit(1);
  }

  const config = await getCloudTalkConfigForProfile(retentionId);
  if (!config) {
    console.error("No active CloudTalk mapping found", { retentionId });
    process.exit(1);
  }

  const authHeader = createAuthHeader();
  const formattedPhone = formatPhone(phoneNumber);
  const parsedName = parseName(fullNameArg);
  const fullName = `${parsedName.firstName} ${parsedName.lastName || ""}`.trim();

  const addPayload = {
    name: fullName,
    favorite_agent: Number(config.agentId),
    ContactNumber: [
      {
        public_number: formattedPhone,
      },
    ],
    ContactsTag: [
      {
        name: config.tagName,
      },
    ],
  };

  console.log("CloudTalk mapping", {
    retentionId,
    campaignId: config.campaignId,
    agentId: config.agentId,
    tagName: config.tagName,
  });

  console.log("Add contact payload", addPayload);

  const { response: addResponse, data: addData } = await callCloudTalk<AddContactResponse>("/contacts/add.json", {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(addPayload),
  });

  console.log("Add contact response", {
    httpStatus: addResponse.status,
    ok: addResponse.ok,
    data: addData,
  });

  const contactId = addData.responseData?.data?.id != null ? String(addData.responseData.data.id) : "";
  if (!addResponse.ok || !contactId) {
    console.error("Contact creation did not return a contact id");
    process.exit(1);
  }

  const { response: showResponse, data: showData } = await callCloudTalk<ShowContactResponse>(`/contacts/show/${contactId}.json`, {
    headers: {
      Authorization: authHeader,
    },
  });

  console.log("Show contact response", {
    httpStatus: showResponse.status,
    ok: showResponse.ok,
    data: showData,
  });

  const { response: campaignResponse, data: campaignData } = await callCloudTalk<CampaignIndexResponse>(
    `/campaigns/index.json?id=${encodeURIComponent(config.campaignId)}`,
    {
      headers: {
        Authorization: authHeader,
      },
    },
  );

  console.log("Campaign response", {
    httpStatus: campaignResponse.status,
    ok: campaignResponse.ok,
    data: campaignData,
  });

  const contactTags = (showData.responseData?.ContactsTag ?? []).map((tag) => tag.name?.trim()).filter(Boolean);
  const campaign = campaignData.responseData?.data?.[0] ?? null;
  const campaignTags = (campaign?.ContactsTag ?? []).map((tag) => tag.name?.trim()).filter(Boolean);

  const summary = {
    createdContactId: contactId,
    contactName: showData.responseData?.Contact?.name ?? null,
    contactTags,
    campaignId: campaign?.Campaign?.id ?? config.campaignId,
    campaignName: campaign?.Campaign?.name ?? null,
    campaignStatus: campaign?.Campaign?.status ?? null,
    campaignTags,
    tagMatchedToCampaign: contactTags.some((tag) => campaignTags.includes(tag)),
  };

  console.log("Summary", summary);
}

main().catch((error) => {
  console.error("cloudtalk test failed", error);
  process.exit(1);
});
