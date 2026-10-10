/**
 * Promotion strip for the RWR data wiki (rwrops).
 *
 * Deliberately a single slim line that can be dismissed for good: rwrsg's job is
 * the stall builder, and this must not push the tool down the page. It sits on a
 * pale brand tint rather than the brand green itself, so the header stays the
 * only saturated band and the strip never reads as a second toolbar.
 */
import { useState } from "react";
import { Button, Typography } from "antd";
import { CloseOutlined, ReadOutlined, RightOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const RWR_OPS_URL = "https://rwrops.b.rwr-infra.uk/?pkg=classic";

const DISMISS_KEY = "rwrsg.promo.rwrops.dismissed";

export default function PromoBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore — dismissing for this session still beats showing it again */
    }
    setDismissed(true);
  };

  return (
    <div className="rwrsg-promo">
      <ReadOutlined aria-hidden="true" style={{ fontSize: 15 }} />
      <Typography.Text strong className="rwrsg-promo-title">
        {t("promo.title")}
      </Typography.Text>
      <Typography.Text className="rwrsg-promo-body">
        {t("promo.body")}
      </Typography.Text>

      <span className="rwrsg-promo-actions">
        <a href={RWR_OPS_URL} target="_blank" rel="noreferrer">
          <Button
            size="small"
            className="rwrsg-promo-cta"
            icon={<RightOutlined />}
          >
            {t("promo.cta")}
          </Button>
        </a>
        <Button
          size="small"
          type="text"
          className="rwrsg-promo-dismiss"
          aria-label={t("promo.dismiss")}
          title={t("promo.dismiss")}
          icon={<CloseOutlined />}
          onClick={dismiss}
        />
      </span>
    </div>
  );
}
