package org.jahia.support.modulemanagement.cli;

import org.jahia.support.modulemanagement.UpdateModulesResult;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityServiceImpl;
import org.junit.Test;
import org.osgi.framework.Bundle;

import java.lang.reflect.Field;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * S21 — the three Karaf CLI commands delegate to the service with the exact arguments. U1.
 * Note (documented in the spec): these commands are gated by Karaf-shell authorization only and
 * bypass the {@code provisioningAccess} permission used by the GraphQL/servlet surfaces.
 */
public class CliCommandsTest {

    private static void setField(Object target, String name, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }

    @Test
    public void updateCommand_delegatesWithCleanMappedToBothFlags() throws Exception {
        ModuleManagementCommunityServiceImpl service = mock(ModuleManagementCommunityServiceImpl.class);
        when(service.updateModules(true, false, null, true, true, true, false))
                .thenReturn(new UpdateModulesResult(Collections.emptySet(), null));

        ModuleManagementCommunityUpdateCommand cmd = new ModuleManagementCommunityUpdateCommand();
        setField(cmd, "communityService", service);
        setField(cmd, "dryRun", false);
        setField(cmd, "clean", true);
        setField(cmd, "force", true);
        setField(cmd, "refresh", false);

        cmd.execute();

        // --clean maps to BOTH autostart and uninstallPrevious; --force maps to forceUpdateAll.
        verify(service).updateModules(true, false, null, true, true, true, false);
    }

    @Test
    public void updateCommand_refreshFlag_callsListAvailableUpdates() throws Exception {
        ModuleManagementCommunityServiceImpl service = mock(ModuleManagementCommunityServiceImpl.class);
        when(service.listAvailableUpdates(true, null, true)).thenReturn(Collections.emptySet());

        ModuleManagementCommunityUpdateCommand cmd = new ModuleManagementCommunityUpdateCommand();
        setField(cmd, "communityService", service);
        setField(cmd, "refresh", true);

        cmd.execute();

        verify(service).listAvailableUpdates(true, null, true);
    }

    @Test
    public void importCommand_delegatesBundleIdAndForce() throws Exception {
        ModuleManagementCommunityServiceImpl service = mock(ModuleManagementCommunityServiceImpl.class);
        Bundle bundle = mock(Bundle.class);
        when(service.getBundleById(42L)).thenReturn(bundle);
        when(service.importModule(bundle, true)).thenReturn(true);

        ModuleManagementCommunityImportCommand cmd = new ModuleManagementCommunityImportCommand();
        setField(cmd, "communityService", service);
        setField(cmd, "bundleId", 42L);
        setField(cmd, "force", true);

        cmd.execute();

        verify(service).getBundleById(42L);
        verify(service).importModule(bundle, true);
    }

    @Test
    public void cleanupCommand_delegatesToCleanupJcrVersions() throws Exception {
        ModuleManagementCommunityServiceImpl service = mock(ModuleManagementCommunityServiceImpl.class);
        when(service.cleanupJcrVersions()).thenReturn("done");

        ModuleManagementCommunityCleanupCommand cmd = new ModuleManagementCommunityCleanupCommand();
        setField(cmd, "communityService", service);

        cmd.execute();

        verify(service).cleanupJcrVersions();
    }
}
