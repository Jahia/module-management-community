package org.jahia.support.modulemanagement.services;

import org.jahia.settings.SettingsBean;
import org.junit.Test;
import org.mockito.MockedStatic;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * S11 / S12 — {@code updateModules} mass-update safety gates. Security-critical (U8): the method
 * writes a provisioning patch that installs/upgrades OSGi bundles, so a live "update every
 * available bundle" request must be refused, and the {@code maxModulesToUpdate} threshold must
 * hold unless {@code forceUpdateAll} is set.
 */
public class UpdateModulesGuardTest {

    private static SettingsBean notReadOnlyProcessingServer() {
        SettingsBean bean = mock(SettingsBean.class);
        when(bean.isMaintenanceMode()).thenReturn(false);
        when(bean.isReadOnlyMode()).thenReturn(false);
        when(bean.isFullReadOnlyMode()).thenReturn(false);
        when(bean.isProcessingServer()).thenReturn(true);
        return bean;
    }

    private static void setMaxModulesToUpdate(ModuleManagementCommunityServiceImpl svc, int max) throws Exception {
        Field f = ModuleManagementCommunityServiceImpl.class.getDeclaredField("maxModulesToUpdate");
        f.setAccessible(true);
        f.setInt(svc, max);
    }

    @Test
    public void liveUpdateAllBundles_notPermitted() {
        SettingsBean bean = notReadOnlyProcessingServer();
        try (MockedStatic<SettingsBean> statics = mockStatic(SettingsBean.class)) {
            statics.when(SettingsBean::getInstance).thenReturn(bean);
            ModuleManagementCommunityServiceImpl service = new ModuleManagementCommunityServiceImpl();

            // jahiaOnly=false, dryRun=false, empty filters → "update everything" → refused.
            assertThatThrownBy(() -> service.updateModules(false, false, Collections.emptyList(),
                    true, true, false, false))
                    .hasMessageContaining("Updating all available bundles not permitted");
        }
        // The guard fires before touching the patches directory.
        verify(bean, org.mockito.Mockito.never()).getJahiaVarDiskPath();
    }

    @Test
    public void countAtOrAboveMax_withoutForce_refused() throws Exception {
        SettingsBean bean = notReadOnlyProcessingServer();
        try (MockedStatic<SettingsBean> statics = mockStatic(SettingsBean.class)) {
            statics.when(SettingsBean::getInstance).thenReturn(bean);

            ModuleManagementCommunityServiceImpl service = spy(new ModuleManagementCommunityServiceImpl());
            setMaxModulesToUpdate(service, 2);
            Set<String> five = new LinkedHashSet<>(Arrays.asList(
                    "a/1:2", "b/1:2", "c/1:2", "d/1:2", "e/1:2"));
            doReturn(five).when(service).listAvailableUpdates(true, null, false);

            // jahiaOnly=true so the "update all" guard is skipped; 5 updates >= max(2) and no force.
            assertThatThrownBy(() -> service.updateModules(true, false, null, true, true, false, false))
                    .hasMessageContaining("5 modules with updates");
        }
        verify(bean, org.mockito.Mockito.never()).getJahiaVarDiskPath();
    }
}
