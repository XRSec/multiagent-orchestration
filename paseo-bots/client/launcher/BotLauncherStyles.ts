/**
 * Purpose: Styling definitions for BotLauncherPopover desktop and mobile views.
 * Context: Extracted from BotLauncherPopover to maintain strict <= 500 line budget.
 * Usage: import { launcherStyles as styles } from "./BotLauncherStyles";
 * Prerequisites: React Native StyleSheet and Paseo typography ui scale.
 */

import { StyleSheet } from "react-native";
import { ui } from "../typography";

export const launcherStyles = StyleSheet.create({
  container: {
    maxWidth: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  embeddedContainer: {
    width: "100%",
    flexShrink: 1,
    borderRadius: 0,
    borderWidth: 0,
    overflow: "hidden",
  },
  mainScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 17,
    paddingVertical: 16,
    gap: 12,
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  mainScrollContentCompact: {
    paddingHorizontal: 17,
    paddingVertical: 12,
    gap: 10,
    paddingBottom: 24,
  },
  mainScrollContentEmbedded: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    gap: 8,
    maxWidth: 820,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  title: {
    flexShrink: 1,
    fontSize: ui(15),
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
    borderRadius: 6,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlsRowCompact: {
    flexWrap: "wrap",
  },
  segmentedControl: {
    flexDirection: "row",
    flexShrink: 0,
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  segmentText: {
    fontSize: ui(12),
    fontWeight: "500",
  },
  selectorSection: {
    width: "100%",
  },
  engineRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  engineHint: {
    fontSize: ui(11),
    flexShrink: 1,
  },
  pillItem: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: ui(13),
    fontWeight: "500",
  },
  inputWrapper: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    minHeight: 96,
  },
  composerBox: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  textInput: {
    minHeight: 28,
    maxHeight: 200,
    paddingVertical: 2,
    paddingHorizontal: 0,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  composerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    gap: 8,
  },
  toolbarLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  toolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  iconPlusBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 14,
    position: "relative",
  },
  selectorTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: 180,
  },
  selectorTriggerText: {
    fontSize: ui(12),
    fontWeight: "500",
    flexShrink: 1,
  },
  micBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  roundSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBadge: {
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBadgeText: {
    fontSize: ui(10),
    fontWeight: "700",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  errorText: {
    fontSize: ui(12),
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    gap: 8,
  },
  footerCompact: {
    paddingTop: 6,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  attachBtnText: {
    fontSize: ui(12),
    fontWeight: "500",
  },
  hintText: {
    fontSize: ui(11),
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    minHeight: 32,
  },
  submitButtonCompact: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  submitContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  submitText: {
    fontSize: ui(13),
    fontWeight: "600",
  },
  submitTextCompact: {
    fontSize: ui(14),
  },
});
